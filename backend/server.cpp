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
#include "BPlus.h"
#include "json.hpp"

using MyBPlusTree = BPlus;
int max_results = 500;
using json = nlohmann::json;


// ===== Utils
static std::string to_upper(std::string s){ for (auto &c: s) c=(char)std::toupper((unsigned char)c); return s; }

int timetoSeconds(const std::string& timestamp) {
    std::tm tm = {};
    std::stringstream ss(timestamp);
    if (ss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S")) {
        return static_cast<int>(std::mktime(&tm));
    }
    // Try date-only fallback (YYYY-MM-DD)
    std::tm tm2 = {};
    std::stringstream ss2(timestamp + " 00:00:00");
    if (ss2 >> std::get_time(&tm2, "%Y-%m-%d %H:%M:%S")) {
        return static_cast<int>(std::mktime(&tm2));
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
        else field.clear();
        result.push_back(field);
    }
    return result;
}

// 32-bit name key (FNV-1a over uppercased name)
static inline uint32_t nameKey32(const std::string& name) {
    const uint32_t FNV_OFFSET = 2166136261u;
    const uint32_t FNV_PRIME  = 16777619u;
    uint32_t hash = FNV_OFFSET;
    for (unsigned char ch : name) {
        unsigned char up = (unsigned char)std::toupper(ch);
        hash ^= up;
        hash *= FNV_PRIME;
    }
    return hash;
}

// ===== LIVE PROCESS MEMORY (RSS / Working Set) =====
static double getProcessMemoryMB() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS_EX pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*)&pmc, sizeof(pmc))) {
        return pmc.WorkingSetSize / (1024.0 * 1024.0);
    }
    return 0.0;
#else
    // Non-Windows: return 0.0 or implement /proc/self/statm parsing if desired
    return 0.0;
#endif
}

// ===== Data loading
std::vector<MarketRecord> loadStockData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);
    if (!file.is_open()) return records;

    std::string line;
    if (!std::getline(file, line)) return records; // header

    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;
        auto fields = splitCSVLine(line);
        if (fields.size() < 5) continue; // need timestamp,name,last,high,low
        try {
            std::string ts     = fields[0];
            std::string name   = fields[1];
            std::string symbol = "";
            double price       = std::stod(fields[2]);
            double high        = std::stod(fields[3]);
            double low         = std::stod(fields[4]);
            double volume      = 0.0;

            records.emplace_back(ts, name, symbol, price, high, low, volume, "STOCK");
            ++count;
        } catch (...) { continue; }
    }
    return records;
}

// CRYPTO.CSV headers
std::vector<MarketRecord> loadCryptoData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);
    if (!file.is_open()) return records;

    std::string line;
    if (!std::getline(file, line)) return records; // header

    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;
        auto fields = splitCSVLine(line);
        if (fields.size() < 4) continue;
        try {
            std::string ts     = fields[0];
            std::string name   = fields[1];
            std::string symbol = fields[2];
            double price       = std::stod(fields[3]);
            double high        = 0.0;
            double low         = 0.0;
            double volume      = 0.0;

            records.emplace_back(ts, name, symbol, price, high, low, volume, "CRYPTO");
            ++count;
        } catch (...) { continue; }
    }
    return records;
}

// ===== Perf test harness
struct PerformanceMetrics {
    double buildTime{};
    double rangeQuery100{};
    double rangeQuery1000{};
    double rangeQuery10000{};
    double exactLookup{};
    double memoryUsage{};
};

class PerformanceTester {
    static double measureTime(std::function<void()> func) {
        auto s = std::chrono::high_resolution_clock::now();
        func();
        auto e = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double>(e - s).count();
    }
public:
    template <typename Tree>
    PerformanceMetrics testTimestamp(Tree& tree, const std::vector<MarketRecord*>& records) {
        PerformanceMetrics m;
        m.rangeQuery100   = measureTime([&](){ auto r = tree.rangeQuery(timetoSeconds("2025-10-20 00:00:00"), timetoSeconds("2025-10-21 00:00:00")); });
        m.rangeQuery1000  = measureTime([&](){ auto r = tree.rangeQuery(timetoSeconds("2025-10-01 00:00:00"), timetoSeconds("2025-10-08 00:00:00")); });
        m.rangeQuery10000 = measureTime([&](){ auto r = tree.rangeQuery(timetoSeconds("2025-09-01 00:00:00"), timetoSeconds("2025-11-30 23:59:59")); });
        m.exactLookup     = measureTime([&](){ if(!records.empty()){ auto r = tree.search(timetoSeconds(records[0]->timestamp)); (void)r; }});
        m.memoryUsage     = 0.0;
        return m;
    }
    template <typename Tree>
    PerformanceMetrics testPrice(Tree& tree, const std::vector<MarketRecord*>& records) {
        PerformanceMetrics m;
        m.rangeQuery100   = measureTime([&](){ auto r = tree.rangeQuery(priceToInt(100.0),  priceToInt(150.0)); });
        m.rangeQuery1000  = measureTime([&](){ auto r = tree.rangeQuery(priceToInt(0.0),    priceToInt(500.0)); });
        m.rangeQuery10000 = measureTime([&](){ auto r = tree.rangeQuery(priceToInt(0.0),    priceToInt(50000.0)); });
        m.exactLookup     = measureTime([&](){ if(!records.empty()){ auto r = tree.search(priceToInt(records[0]->price)); (void)r; }});
        m.memoryUsage     = 0.0;
        return m;
    }
};

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

// Persist perf snapshot for static table
static void writePerfJSON(
    const std::string& outPath,
    const PerformanceMetrics& tsBT,
    const PerformanceMetrics& prBT,
    const PerformanceMetrics& tsBP,
    const PerformanceMetrics& prBP,
    double mem_tsBT_mb,
    double mem_tsBP_mb,
    double mem_prBT_mb,
    double mem_prBP_mb
) {
    auto emit = [](std::ofstream& f, const char* name, const PerformanceMetrics& m, double mem){
        f << "    \"" << name << "\": {\n";
        f << "      \"buildTime\": " << m.buildTime << ",\n";
        f << "      \"rangeQuery100\": " << m.rangeQuery100 << ",\n";
        f << "      \"rangeQuery1000\": " << m.rangeQuery1000 << ",\n";
        f << "      \"rangeQuery10000\": " << m.rangeQuery10000 << ",\n";
        f << "      \"exactLookup\": " << m.exactLookup << ",\n";
        f << "      \"memory\": " << mem << "\n";
        f << "    }";
    };

    std::ofstream f(outPath, std::ios::trunc);
    f << "{\n";
    f << "  \"updatedAt\": \"" << isoNow() << "\",\n";
    f << "  \"timestamp_index\": {\n";
    emit(f, "btree", tsBT, mem_tsBT_mb); f << ",\n";
    emit(f, "bplustree", tsBP, mem_tsBP_mb); f << "\n";
    f << "  },\n";
    f << "  \"price_index\": {\n";
    emit(f, "btree", prBT, mem_prBT_mb); f << ",\n";
    emit(f, "bplustree", prBP, mem_prBP_mb); f << "\n";
    f << "  }\n";
    f << "}\n";
    f.close();
}

int main() {
    // Load data
    auto stocks = loadStockData("stocks.csv", 9999999);
    auto crypto = loadCryptoData("crypto.csv", 9999999);

    std::vector<MarketRecord*> records;
    records.reserve(stocks.size() + crypto.size());
    for (auto& r : stocks)  records.push_back(new MarketRecord(r));
    for (auto& r : crypto)  records.push_back(new MarketRecord(r));

    // Indexes
    MyBTree     timestampBTree, priceBTree, nameBTree;
    MyBPlusTree timestampBPlus, priceBPlus, nameBPlus;

    // Build B-Tree
    auto buildStartBT = std::chrono::high_resolution_clock::now();
    for (auto* p : records) {
        timestampBTree.insert(timetoSeconds(p->timestamp), p);
        priceBTree.insert(priceToInt(p->price), p);
        uint32_t nk = nameKey32(to_upper(p->name));
        nameBTree.insert(static_cast<int>(nk), p);
    }
    auto buildEndBT = std::chrono::high_resolution_clock::now();
    const double btreeBuildSec = std::chrono::duration<double>(buildEndBT - buildStartBT).count();

    // Build B+ Tree
    auto buildStartBP = std::chrono::high_resolution_clock::now();
    for (auto* p : records) {
        timestampBPlus.insert(timetoSeconds(p->timestamp), p);
        priceBPlus.insert(priceToInt(p->price), p);
        uint32_t nk = nameKey32(to_upper(p->name));
        nameBPlus.insert(static_cast<int>(nk), p);
    }
    auto buildEndBP = std::chrono::high_resolution_clock::now();
    const double bplusBuildSec = std::chrono::duration<double>(buildEndBP - buildStartBP).count();

    // Tester
    PerformanceTester tester;

    // Static perf snapshot
    auto tsBT = tester.testTimestamp(timestampBTree, records);
    tsBT.buildTime = btreeBuildSec;
    auto prBT = tester.testPrice(priceBTree, records);
    prBT.buildTime = btreeBuildSec;

    auto tsBP = tester.testTimestamp(timestampBPlus, records);
    tsBP.buildTime = bplusBuildSec;
    auto prBP = tester.testPrice(priceBPlus, records);
    prBP.buildTime = bplusBuildSec;

    auto toMB = [](size_t bytes){ return static_cast<double>(bytes) / (1024.0 * 1024.0); };
    double mem_tsBT_mb = toMB(timestampBTree.approxBytes());
    double mem_tsBP_mb = toMB(timestampBPlus.approxBytes());
    double mem_prBT_mb = toMB(priceBTree.approxBytes());
    double mem_prBP_mb = toMB(priceBPlus.approxBytes());

    std::string perfPath = (std::filesystem::current_path() / "performance_results.json").string();
    writePerfJSON(perfPath, tsBT, prBT, tsBP, prBP,
                  mem_tsBT_mb, mem_tsBP_mb, mem_prBT_mb, mem_prBP_mb);

    // ===== Query loop (stdin JSON -> stdout JSON) =====
    std::string query_string;
    while (std::getline(std::cin, query_string)) {
        try {
            json query = json::parse(query_string);
            std::string query_type = query.value("queryType", "");
            json results = json::array();

            double btreeQuerySec = 0.0, bplusQuerySec = 0.0;
            double btreeMemMB = 0.0,  bplusMemMB  = 0.0;

            if (query_type == "ticker") {
                if (!query.contains("ticker") || !query["ticker"].is_string()) {
                    json err = json::object(); err["error"] = "ticker must be a string";
                    std::cout << err.dump() << std::endl; continue;
                }
                std::string q = to_upper(query["ticker"].get<std::string>());
                int key = static_cast<int>(nameKey32(q));

                auto qStartBT = std::chrono::high_resolution_clock::now();
                auto res_bt = nameBTree.rangeQuery(key, key);
                auto qEndBT = std::chrono::high_resolution_clock::now();
                btreeQuerySec = std::chrono::duration<double>(qEndBT - qStartBT).count();

                auto qStartBP = std::chrono::high_resolution_clock::now();
                auto res_bp = nameBPlus.rangeQuery(key, key);
                auto qEndBP = std::chrono::high_resolution_clock::now();
                bplusQuerySec = std::chrono::duration<double>(qEndBP - qStartBP).count();

                btreeMemMB = toMB(nameBTree.approxBytes());
                bplusMemMB = toMB(nameBPlus.approxBytes());

                const auto& chosen = !res_bt.empty() ? res_bt : res_bp;
                for (auto* r : chosen) {
                    if (!r) continue;
                    json j = json::object();
                    j["timestamp"] = r->timestamp;
                    j["name"]      = r->name;
                    j["symbol"]    = r->symbol;  // stocks will be "", crypto will have symbol
                    j["price"]     = r->price;
                    j["high"]      = r->high;
                    j["low"]       = r->low;
                    j["type"]      = r->type;
                    results.push_back(std::move(j));
                    if (results.size() >= (size_t)max_results) break;
                }

            } else if (query_type == "dateRange") {
                std::string startDate = query.value("startDate", "");
                std::string endDate   = query.value("endDate", "");
                int lo = timetoSeconds(startDate + " 00:00:00");
                int hi = timetoSeconds(endDate   + " 23:59:59");

                auto qStartBT = std::chrono::high_resolution_clock::now();
                auto results_range_bt = timestampBTree.rangeQuery(lo, hi);
                auto qEndBT = std::chrono::high_resolution_clock::now();
                btreeQuerySec = std::chrono::duration<double>(qEndBT - qStartBT).count();

                auto qStartBP = std::chrono::high_resolution_clock::now();
                auto results_range_bp = timestampBPlus.rangeQuery(lo, hi);
                auto qEndBP = std::chrono::high_resolution_clock::now();
                bplusQuerySec = std::chrono::duration<double>(qEndBP - qStartBP).count();

                btreeMemMB = toMB(timestampBTree.approxBytes());
                bplusMemMB = toMB(timestampBPlus.approxBytes());

                for (auto result : results_range_bt) {
                    if (results.size() >= (size_t)max_results) break;
                    if (!result) continue;
                    json r = json::object();
                    r["timestamp"] = result->timestamp;
                    r["name"]      = result->name;
                    r["symbol"]    = result->symbol;
                    r["price"]     = result->price;
                    r["high"]      = result->high;
                    r["low"]       = result->low;
                    r["type"]      = result->type;
                    results.push_back(std::move(r));
                }

            } else if (query_type == "priceRange") {
                double minPrice = query.value("minPrice", 0.0);
                double maxPrice = query.value("maxPrice", 0.0);
                int lo = priceToInt(minPrice);
                int hi = priceToInt(maxPrice);

                auto qStartBT = std::chrono::high_resolution_clock::now();
                auto results_range_bt = priceBTree.rangeQuery(lo, hi);
                auto qEndBT = std::chrono::high_resolution_clock::now();
                btreeQuerySec = std::chrono::duration<double>(qEndBT - qStartBT).count();

                auto qStartBP = std::chrono::high_resolution_clock::now();
                auto results_range_bp = priceBPlus.rangeQuery(lo, hi);
                auto qEndBP = std::chrono::high_resolution_clock::now();
                bplusQuerySec = std::chrono::duration<double>(qEndBP - qStartBP).count();

                btreeMemMB = toMB(priceBTree.approxBytes());
                bplusMemMB = toMB(priceBPlus.approxBytes());

                for (auto result : results_range_bt) {
                    if (results.size() >= (size_t)max_results) break;
                    if (!result) continue;
                    json r = json::object();
                    r["timestamp"] = result->timestamp;
                    r["name"]      = result->name;
                    r["symbol"]    = result->symbol;
                    r["price"]     = result->price;
                    r["high"]      = result->high;
                    r["low"]       = result->low;
                    r["type"]      = result->type;
                    results.push_back(std::move(r));
                }

            } else if (query_type == "runPerf") {
                auto tsBT2 = tester.testTimestamp(timestampBTree, records);
                tsBT2.buildTime = btreeBuildSec;
                auto prBT2 = tester.testPrice(priceBTree, records);
                prBT2.buildTime = btreeBuildSec;

                auto tsBP2 = tester.testTimestamp(timestampBPlus, records);
                tsBP2.buildTime = bplusBuildSec;
                auto prBP2 = tester.testPrice(priceBPlus, records);
                prBP2.buildTime = bplusBuildSec;

                std::string perfPath2 = (std::filesystem::current_path() / "performance_results.json").string();
                writePerfJSON(perfPath2, tsBT2, prBT2, tsBP2, prBP2,
                              toMB(timestampBTree.approxBytes()), toMB(timestampBPlus.approxBytes()),
                              toMB(priceBTree.approxBytes()),     toMB(priceBPlus.approxBytes()));
                json ok = json::object(); ok["ok"] = true;
                std::cout << ok.dump() << std::endl;
                continue;
            }

            json response = json::object();
            response["results"]   = results;
            response["size"]      = records.size();
            response["queryType"] = query_type;

            json metrics = json::object();
            json btree   = json::object();
            btree["querySec"] = btreeQuerySec;
            btree["buildSec"] = btreeBuildSec;
            btree["memoryMB"] = btreeMemMB;
            metrics["btree"] = btree;

            json bpl = json::object();
            bpl["querySec"] = bplusQuerySec;
            bpl["buildSec"] = bplusBuildSec;
            bpl["memoryMB"] = bplusMemMB;
            metrics["bplustree"] = bpl;

            // Live total process memory (RSS/Working Set)
            metrics["rssMB"] = getProcessMemoryMB();

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
