#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <ctime>
#include <iomanip>
#include <algorithm>
#include <chrono>
#include <functional>
#include <map>
#include <cctype>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#endif

#include "BTree.h"
#include "json.hpp"

int max_results = 500;
using json = nlohmann::json;

int timetoSeconds(const std::string& timestamp) {
    std::tm tm = {};
    std::stringstream ss(timestamp);
    if (ss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S")) {
        return static_cast<int>(std::mktime(&tm));
    }
    return 0;
}
int priceToInt(double price) { return static_cast<int>(price * 100); }

std::vector<std::string> splitCSVLine(const std::string& line) {
    std::vector<std::string> result;
    std::stringstream ss(line);
    std::string field;
    while (std::getline(ss, field, ',')) {
        size_t start = field.find_first_not_of(" \t\r\n");
        size_t end = field.find_last_not_of(" \t\r\n");
        if (start != std::string::npos) field = field.substr(start, end - start + 1);
        else field = "";
        result.push_back(field);
    }
    return result;
}
static std::string to_upper(std::string s){ for (auto &c: s) c=(char)std::toupper((unsigned char)c); return s; }

// === Data loading ============================================================
std::vector<MarketRecord> loadStockData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);
    if (!file.is_open()) return records;
    std::string line; std::getline(file, line);
    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;
        std::vector<std::string> fields = splitCSVLine(line);
        if (fields.size() < 9) continue;
        try {
            auto trimq = [](std::string s){
                if (!s.empty() && s.front()=='"' && s.back()=='"') return s.substr(1, s.size()-2);
                return s;
            };
            std::string ts     = fields[0];
            std::string name   = trimq(fields[1]);
            std::string symbol = "";
            double price  = std::stod(fields[3]);
            double high   = std::stod(fields[4]);
            double low    = std::stod(fields[5]);
            double volume = std::stod(fields[7]);
            records.push_back(MarketRecord(ts, name, symbol, price, high, low, volume, "STOCK"));
            count++;
        } catch (...) { continue; }
    }
    return records;
}

std::vector<MarketRecord> loadCryptoData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);
    if (!file.is_open()) return records;
    std::string line; std::getline(file, line);
    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;
        std::vector<std::string> fields = splitCSVLine(line);
        if (fields.size() < 9) continue;
        try {
            records.push_back(MarketRecord(
                fields[0], fields[1], fields[2],
                std::stod(fields[3]), 0.0, 0.0,
                std::stod(fields[5]), "CRYPTO"
            ));
            count++;
        } catch (...) { continue; }
    }
    return records;
}

// === Performance metrics / tests ============================================
struct PerformanceMetrics {
    double buildTime{};
    double rangeQuery100{};
    double rangeQuery1000{};
    double rangeQuery10000{};
    double exactLookup{};
    double memoryUsage{};
};

class PerformanceTester {
private:
    double measureTime(std::function<void()> func) {
        auto start = std::chrono::high_resolution_clock::now();
        func();
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed = end - start;
        return elapsed.count();
    }
public:
    PerformanceMetrics testBTreeTimestamp(MyBTree& tree, const std::vector<MarketRecord*>& records) {
        PerformanceMetrics m;
        m.rangeQuery100 = measureTime([&](){
            auto results = tree.rangeQuery(
                timetoSeconds("2025-10-20 00:00:00"),
                timetoSeconds("2025-10-21 00:00:00")
            );
        });
        m.rangeQuery1000 = measureTime([&](){
            auto results = tree.rangeQuery(
                timetoSeconds("2025-10-01 00:00:00"),
                timetoSeconds("2025-10-08 00:00:00")
            );
        });
        m.rangeQuery10000 = measureTime([&](){
            auto results = tree.rangeQuery(
                timetoSeconds("2025-09-01 00:00:00"),
                timetoSeconds("2025-11-30 23:59:59")
            );
        });
        m.exactLookup = measureTime([&](){
            if (!records.empty()) { auto r = tree.search(timetoSeconds(records[0]->timestamp)); (void)r; }
        });
        m.memoryUsage = records.size() * sizeof(MarketRecord) / (1024.0 * 1024.0);
        return m;
    }
    PerformanceMetrics testBTreePrice(MyBTree& tree, const std::vector<MarketRecord*>& records) {
        PerformanceMetrics m;
        m.rangeQuery100 = measureTime([&](){
            auto results = tree.rangeQuery(priceToInt(100.0), priceToInt(150.0));
        });
        m.rangeQuery1000 = measureTime([&](){
            auto results = tree.rangeQuery(priceToInt(0.0), priceToInt(500.0));
        });
        m.rangeQuery10000 = measureTime([&](){
            auto results = tree.rangeQuery(priceToInt(0.0), priceToInt(50000.0));
        });
        m.exactLookup = measureTime([&](){
            if (!records.empty()) { auto r = tree.search(priceToInt(records[0]->price)); (void)r; }
        });
        m.memoryUsage = records.size() * sizeof(MarketRecord) / (1024.0 * 1024.0);
        return m;
    }
};

// === Indexes / in-memory state =============================================
static std::map<std::string, std::vector<MarketRecord*>> nameIndex;

// === Time/Memory helpers ====================================================
static std::string isoNow() {
    using namespace std::chrono;
    auto t = system_clock::now();
    std::time_t tt = system_clock::to_time_t(t);
    std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm, &tt);
#else
    gmtime_r(&tt, &tm);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
    return std::string(buf);
}

static double rssMB() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS_EX pmc{};
    if (GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*)&pmc, sizeof(pmc))) {
        return pmc.WorkingSetSize / (1024.0 * 1024.0);
    }
#endif
    return -1.0;
}

// === Perf JSON writer =======================================================
static void writePerfJSON(
    const std::string& outPath,
    const PerformanceMetrics& ts,
    const PerformanceMetrics& pr,
    double rss_now_mb,
    double buildTimeSec
) {
    std::ofstream f(outPath, std::ios::trunc);
    f << "{\n";
    f << "  \"updatedAt\": \"" << isoNow() << "\",\n";
    f << "  \"timestamp_index\": {\n";
    f << "    \"btree\": {\n";
    f << "      \"buildTime\": " << buildTimeSec << ",\n";
    f << "      \"rangeQuery100\": " << ts.rangeQuery100 << ",\n";
    f << "      \"rangeQuery1000\": " << ts.rangeQuery1000 << ",\n";
    f << "      \"rangeQuery10000\": " << ts.rangeQuery10000 << ",\n";
    f << "      \"exactLookup\": " << ts.exactLookup << ",\n";
    f << "      \"memory\": " << rss_now_mb << "\n";
    f << "    },\n";
    f << "    \"bplustree\": { \"buildTime\": 0, \"rangeQuery100\": 0, \"rangeQuery1000\": 0, \"rangeQuery10000\": 0, \"exactLookup\": 0, \"memory\": 0 }\n";
    f << "  },\n";
    f << "  \"price_index\": {\n";
    f << "    \"btree\": {\n";
    f << "      \"buildTime\": " << buildTimeSec << ",\n";
    f << "      \"rangeQuery100\": " << pr.rangeQuery100 << ",\n";
    f << "      \"rangeQuery1000\": " << pr.rangeQuery1000 << ",\n";
    f << "      \"rangeQuery10000\": " << pr.rangeQuery10000 << ",\n";
    f << "      \"exactLookup\": " << pr.exactLookup << ",\n";
    f << "      \"memory\": " << rss_now_mb << "\n";
    f << "    },\n";
    f << "    \"bplustree\": { \"buildTime\": 0, \"rangeQuery100\": 0, \"rangeQuery1000\": 0, \"rangeQuery10000\": 0, \"exactLookup\": 0, \"memory\": 0 }\n";
    f << "  }\n";
    f << "}\n";
    f.close();
}

// Main:
int main() {
    auto stocks = loadStockData("stocks.csv", 9999999);
    auto crypto = loadCryptoData("crypto.csv", 9999999);

    std::vector<MarketRecord*> records;

    MyBTree timestampBTree;
    MyBTree priceBTree;
    auto buildStart = std::chrono::high_resolution_clock::now();

    for (auto& record : stocks) {
        auto* p = new MarketRecord(record.timestamp, record.name, record.symbol,
                                   record.price, record.high, record.low, record.volume, record.type);
        records.push_back(p);
        timestampBTree.insert(timetoSeconds(p->timestamp), p);
        priceBTree.insert(priceToInt(p->price), p);
        nameIndex[to_upper(p->name)].push_back(p);
    }
    for (auto& record : crypto) {
        auto* p = new MarketRecord(record.timestamp, record.name, record.symbol,
                                   record.price, record.high, record.low, record.volume, record.type);
        records.push_back(p);
        timestampBTree.insert(timetoSeconds(p->timestamp), p);
        priceBTree.insert(priceToInt(p->price), p);
        nameIndex[to_upper(p->name)].push_back(p);
    }

    auto buildEnd = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> buildTime = buildEnd - buildStart;
    const double buildTimeSec = buildTime.count();

    PerformanceTester tester;
    auto timestampMetrics = tester.testBTreeTimestamp(timestampBTree, records);
    timestampMetrics.buildTime = buildTimeSec;
    auto priceMetrics = tester.testBTreePrice(priceBTree, records);
    priceMetrics.buildTime = buildTimeSec;

    std::string perfPath = (std::filesystem::current_path() / "performance_results.json").string();
    writePerfJSON(perfPath, timestampMetrics, priceMetrics, rssMB(), buildTimeSec);

    std::string query_string;
    while (std::getline(std::cin, query_string)) {
        try {
            json query = json::parse(query_string);
            std::string query_type = query.value("queryType", "");
            json results = json::array();

            auto qStart = std::chrono::high_resolution_clock::now();

            // ticker
            if (query_type == "ticker") {
                if (!query.contains("ticker") || !query["ticker"].is_string()) {
                    json err = json::object(); err["error"] = "ticker must be a string";
                    std::cout << err.dump() << std::endl; continue;
                }
                std::string q = to_upper(query["ticker"].get<std::string>());
                auto it  = nameIndex.lower_bound(q);
                auto it2 = nameIndex.lower_bound(q + '\xFF');
                for (; it != it2 && results.size() < (size_t)max_results; ++it) {
                    for (auto* record : it->second) {
                        if (!record) continue;
                        json r = json::object();
                        r["timestamp"] = record->timestamp;
                        r["name"]      = record->name;
                        r["symbol"]    = record->symbol;
                        r["price"]     = record->price;
                        r["high"]      = record->high;
                        r["low"]       = record->low;
                        r["volume"]    = record->volume;
                        r["type"]      = record->type;
                        results.push_back(std::move(r));
                        if (results.size() >= (size_t)max_results) break;
                    }
                }
                if (results.empty()) {
                    for (auto* record : records) {
                        if (!record) continue;
                        std::string name_up = to_upper(record->name);
                        if (name_up.find(q) != std::string::npos) {
                            json r = json::object();
                            r["timestamp"] = record->timestamp;
                            r["name"]      = record->name;
                            r["symbol"]    = record->symbol;
                            r["price"]     = record->price;
                            r["high"]      = record->high;
                            r["low"]       = record->low;
                            r["volume"]    = record->volume;
                            r["type"]      = record->type;
                            results.push_back(std::move(r));
                            if (results.size() >= (size_t)max_results) break;
                        }
                    }
                }

            // dateRange
            } else if (query_type == "dateRange") {
                std::string startDate = query.value("startDate", "");
                std::string endDate   = query.value("endDate", "");
                auto results_range = timestampBTree.rangeQuery(
                    timetoSeconds(startDate + " 00:00:00"),
                    timetoSeconds(endDate   + " 23:59:59")
                );
                for (auto result : results_range) {
                    if (results.size() >= (size_t)max_results) break;
                    json r = json::object();
                    r["timestamp"] = result->timestamp;
                    r["name"]      = result->name;
                    r["symbol"]    = result->symbol;
                    r["price"]     = result->price;
                    r["high"]      = result->high;
                    r["low"]       = result->low;
                    r["volume"]    = result->volume;
                    r["type"]      = result->type;
                    results.push_back(std::move(r));
                }

            // priceRange
            } else if (query_type == "priceRange") {
                double minPrice = query.value("minPrice", 0.0);
                double maxPrice = query.value("maxPrice", 0.0);
                auto results_range = priceBTree.rangeQuery(
                    priceToInt(minPrice),
                    priceToInt(maxPrice)
                );
                for (auto result : results_range) {
                    if (results.size() >= (size_t)max_results) break;
                    json r = json::object();
                    r["timestamp"] = result->timestamp;
                    r["name"]      = result->name;
                    r["symbol"]    = result->symbol;
                    r["price"]     = result->price;
                    r["high"]      = result->high;
                    r["low"]       = result->low;
                    r["volume"]    = result->volume;
                    r["type"]      = result->type;
                    results.push_back(std::move(r));
                }

            // --- runPerf (refresh perf JSON + live memory) -------------------
            } else if (query_type == "runPerf") {
                auto ts = tester.testBTreeTimestamp(timestampBTree, records);
                ts.buildTime = buildTimeSec;
                auto pr = tester.testBTreePrice(priceBTree, records);
                pr.buildTime = buildTimeSec;
                writePerfJSON(perfPath, ts, pr, rssMB(), buildTimeSec);
                json ok = json::object(); ok["ok"] = true;
                std::cout << ok.dump() << std::endl;
                continue;
            }

            // --- response w/ live metrics ---------------------------------
            auto qEnd = std::chrono::high_resolution_clock::now();
            double querySec = std::chrono::duration<double>(qEnd - qStart).count();

            json response = json::object();
            response["results"]   = results;
            response["size"]      = records.size();
            response["queryType"] = query_type;

            json metrics = json::object();
            json btree   = json::object();
            btree["querySec"] = querySec;
            btree["buildSec"] = buildTimeSec;
            btree["memoryMB"] = rssMB();
            metrics["btree"] = btree;

            json bpl = json::object();
            bpl["querySec"] = nullptr;
            bpl["buildSec"] = nullptr;
            bpl["memoryMB"] = nullptr;
            metrics["bplustree"] = bpl;

            response["metrics"] = metrics;

            std::cout << response.dump() << std::endl;

        } catch (const std::exception& e) {
            json error_response = json::object();
            error_response["error"] = e.what();
            std::cout << error_response.dump() << std::endl;
        }
    }

    for (auto record_ptr : records) delete record_ptr;
    return 0;
}
