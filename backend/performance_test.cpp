#include <iostream>
#include <fstream>
#include <chrono>
#include <vector>
#include <string>
#include <iomanip>

#include "BTree.h"
#include "BPlusTree.h"

struct MarketRecord {
    std::string timestamp;
    std::string name;
    std::string symbol;
    double price;
    double high;
    double low;
    double volume;
    std::string type;
};

int timetoSeconds(const std::string& timestamp) {
    std::tm tm = {};
    std::stringstream ss(timestamp);
    std::get_time(&tm, "%Y-%m-%d %H:%M:%S");

    return static_cast<int>(std::mktime(&tm));
}

struct PerformanceMetrics {
    double buildTime;
    double rangeQuery100;
    double rangeQuery1000;
    double rangeQuery10000;
    double exactLookup;
    double sequentialScan;
    double memoryUsage;
};

class PerformanceTester {
private:
    std::vector<MarketRecord> data;

    double measureTime(std::function<void()> func) {
        auto start = std::chrono::high_resolution_clock::now();
        func();
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed = end - start;
        return elapsed.count();
    }

public:
    PerformanceTester(const std::vector<MarketRecord>& records) : data(records) {}

    template<typename TreeType>
    PerformanceMetrics testTree(const std::string& treeName, const std::string& indexType) {
        std::cout << "\nTesting " << treeName << " (" << indexType << " index)..." << std::endl;

        PerformanceMetrics metrics;
        TreeType tree;

        metrics.buildTime = measureTime([&]() {
            for (const auto& record : data) {
                if (indexType == "timestamp") {
                    tree.insert(record.timestamp, record);
                } else if (indexType == "price") {
                    tree.insert(record.price, record);
                }
            }
        });
        std::cout << "  Build time: " << std::fixed << std::setprecision(3)
                  << metrics.buildTime << "s" << std::endl;

        metrics.rangeQuery100 = measureTime([&]() {
            if (indexType == "timestamp") {
                auto results = tree.rangeQuery("2024-01-15", "2024-01-16");
            } else {
                auto results = tree.rangeQuery(100.0, 500.0);
            }
        });
        std::cout << "  Range query (100): " << metrics.rangeQuery100 << "s" << std::endl;

        metrics.rangeQuery1000 = measureTime([&]() {
            if (indexType == "timestamp") {
                auto results = tree.rangeQuery("2024-01-01", "2024-01-31");
            } else {
                auto results = tree.rangeQuery(50.0, 1000.0);
            }
        });
        std::cout << "  Range query (1000): " << metrics.rangeQuery1000 << "s" << std::endl;

        metrics.rangeQuery10000 = measureTime([&]() {
            if (indexType == "timestamp") {
                auto results = tree.rangeQuery("2024-01-01", "2024-12-31");
            } else {
                auto results = tree.rangeQuery(0.0, 50000.0);
            }
        });
        std::cout << "  Range query (10000): " << metrics.rangeQuery10000 << "s" << std::endl;

        metrics.exactLookup = measureTime([&]() {
            if (indexType == "timestamp") {
                auto result = tree.search("2024-01-15 10:00");
            } else {
                auto result = tree.search(250.5);
            }
        });
        std::cout << "  Exact lookup: " << metrics.exactLookup << "s" << std::endl;

        metrics.sequentialScan = measureTime([&]() {
            tree.traverseInOrder();
        });
        std::cout << "  Sequential scan: " << metrics.sequentialScan << "s" << std::endl;

        metrics.memoryUsage = data.size() * sizeof(MarketRecord) / (1024.0 * 1024.0);
        std::cout << "  Memory usage (est): " << metrics.memoryUsage << " MB" << std::endl;

        return metrics;
    }

    void exportToJSON(const std::string& filename,
                     const PerformanceMetrics& btreeTimestamp,
                     const PerformanceMetrics& bplusTimestamp,
                     const PerformanceMetrics& btreePrice,
                     const PerformanceMetrics& bplusPrice) {

        std::ofstream file(filename);

        file << "{\n";
        file << "  \"timestamp_index\": {\n";
        file << "    \"btree\": {\n";
        file << "      \"buildTime\": " << btreeTimestamp.buildTime << ",\n";
        file << "      \"rangeQuery100\": " << btreeTimestamp.rangeQuery100 << ",\n";
        file << "      \"rangeQuery1000\": " << btreeTimestamp.rangeQuery1000 << ",\n";
        file << "      \"rangeQuery10000\": " << btreeTimestamp.rangeQuery10000 << ",\n";
        file << "      \"exactLookup\": " << btreeTimestamp.exactLookup << ",\n";
        file << "      \"sequentialScan\": " << btreeTimestamp.sequentialScan << ",\n";
        file << "      \"memory\": " << btreeTimestamp.memoryUsage << "\n";
        file << "    },\n";
        file << "    \"bplustree\": {\n";
        file << "      \"buildTime\": " << bplusTimestamp.buildTime << ",\n";
        file << "      \"rangeQuery100\": " << bplusTimestamp.rangeQuery100 << ",\n";
        file << "      \"rangeQuery1000\": " << bplusTimestamp.rangeQuery1000 << ",\n";
        file << "      \"rangeQuery10000\": " << bplusTimestamp.rangeQuery10000 << ",\n";
        file << "      \"exactLookup\": " << bplusTimestamp.exactLookup << ",\n";
        file << "      \"sequentialScan\": " << bplusTimestamp.sequentialScan << ",\n";
        file << "      \"memory\": " << bplusTimestamp.memoryUsage << "\n";
        file << "    }\n";
        file << "  },\n";
        file << "  \"price_index\": {\n";
        file << "    \"btree\": {\n";
        file << "      \"buildTime\": " << btreePrice.buildTime << ",\n";
        file << "      \"rangeQuery100\": " << btreePrice.rangeQuery100 << ",\n";
        file << "      \"rangeQuery1000\": " << btreePrice.rangeQuery1000 << ",\n";
        file << "      \"rangeQuery10000\": " << btreePrice.rangeQuery10000 << ",\n";
        file << "      \"exactLookup\": " << btreePrice.exactLookup << ",\n";
        file << "      \"sequentialScan\": " << btreePrice.sequentialScan << ",\n";
        file << "      \"memory\": " << btreePrice.memoryUsage << "\n";
        file << "    },\n";
        file << "    \"bplustree\": {\n";
        file << "      \"buildTime\": " << bplusPrice.buildTime << ",\n";
        file << "      \"rangeQuery100\": " << bplusPrice.rangeQuery100 << ",\n";
        file << "      \"rangeQuery1000\": " << bplusPrice.rangeQuery1000 << ",\n";
        file << "      \"rangeQuery10000\": " << bplusPrice.rangeQuery10000 << ",\n";
        file << "      \"exactLookup\": " << bplusPrice.exactLookup << ",\n";
        file << "      \"sequentialScan\": " << bplusPrice.sequentialScan << ",\n";
        file << "      \"memory\": " << bplusPrice.memoryUsage << "\n";
        file << "    }\n";
        file << "  }\n";
        file << "}\n";

        file.close();
        std::cout << "\nPerformance results exported to " << filename << std::endl;
    }
};

int main() {
    std::vector<MarketRecord> data;
    data = loadAllData("stocks.csv", "crypto.csv");

    std::cout << "Performance Testing Framework" << std::endl;
    std::cout << "=============================" << std::endl;

    PerformanceTester tester(data);

    auto btreeTimestamp = tester.testTree<BTree>("B-Tree", "timestamp");
    auto bplusTimestamp = tester.testTree<BPlusTree>("B+ Tree", "timestamp");
    auto btreePrice = tester.testTree<BTree>("B-Tree", "price");
    auto bplusPrice = tester.testTree<BPlusTree>("B+ Tree", "price");

    tester.exportToJSON("performance_results.json",
                       btreeTimestamp, bplusTimestamp,
                       btreePrice, bplusPrice);

    std::cout << "\nTesting complete!" << std::endl;
    std::cout << "Results saved to performance_results.json" << std::endl;

    return 0;
}