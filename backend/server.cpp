#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <ctime>
#include <iomanip>
#include <algorithm>
#include "BTree.h"
#include "json.hpp" // json library for c++ to parse and simplify using json
int max_results = 500;
using json = nlohmann::json;
int timetoSeconds(const std::string& timestamp) {
    std::tm tm = {};
    std::stringstream ss(timestamp);
    

    if(ss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S")) {
        return static_cast<int>(std::mktime(&tm));
    }
    std::cout << "Error" << std::endl;
    return 0;
}
std::vector<std::string> splitCSVLine(const std::string& line) {
    std::vector<std::string> result;
    std::stringstream ss(line);
    std::string field;

    while (std::getline(ss, field, ',')) {
        size_t start = field.find_first_not_of(" \t\r\n");
        size_t end = field.find_last_not_of(" \t\r\n");
        if (start != std::string::npos) {
            field = field.substr(start, end - start + 1);
        } else {
            field = "";
        }
        result.push_back(field);
    }

    return result;
}

std::vector<MarketRecord> loadStockData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);

    if (!file.is_open()) {
        std::cerr << "Error: Could not open " << filename << std::endl;
        return records;
    }

    std::string line;
    std::getline(file, line);

    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;

        std::vector<std::string> fields = splitCSVLine(line);
        if (fields.size() < 9) continue;

        try {
            records.push_back(MarketRecord(fields[0], fields[1], fields[1], std::stod(fields[2]), std::stod(fields[3]), std::stod(fields[4]), std::stod(fields[7]), "STOCK"));
            count++;
        } catch (...) {
            continue;
        }
    }

    file.close();
    return records;
}

std::vector<MarketRecord> loadCryptoData(const std::string& filename, int maxRows) {
    std::vector<MarketRecord> records;
    std::ifstream file(filename);

    if (!file.is_open()) {
        std::cerr << "Error: Could not open " << filename << std::endl;
        return records;
    }

    std::string line;
    std::getline(file, line);

    int count = 0;
    while (std::getline(file, line) && count < maxRows) {
        if (line.empty()) continue;

        std::vector<std::string> fields = splitCSVLine(line);
        if (fields.size() < 9) continue;
        try {
            records.push_back(MarketRecord(fields[0], fields[1], fields[2], std::stod(fields[3]), 0.0, 0.0, std::stod(fields[5]), "CRYPTO"));
            count++;
        } catch (...) {
            continue;
        }
    }

    file.close();
    return records;
}
int priceToInt(double price) {
    return static_cast<int>(price * 100); // we will need to convert the double to an int to use within btree
}

int main() {
    MyBTree timestampBTree;
    MyBTree priceBTree;
    auto stocks = loadStockData("stocks.csv", 9999999);
    auto crypto = loadCryptoData("crypto.csv", 9999999);
    std::vector<MarketRecord*> records;
    for(auto record : stocks) {
        MarketRecord* record_ptr = new MarketRecord(record.timestamp, record.name, record.symbol, record.price, record.high, record.low, record.volume, record.type);   
        records.push_back(record_ptr);
        timestampBTree.insert(timetoSeconds(record_ptr->timestamp), record_ptr);
        priceBTree.insert(priceToInt(record_ptr->price), record_ptr);
    }
    for(auto record : crypto) {
        MarketRecord* record_ptr = new MarketRecord(record.timestamp, record.name, record.symbol, record.price, record.high, record.low, record.volume, record.type);
        records.push_back(record_ptr);
        timestampBTree.insert(timetoSeconds(record_ptr->timestamp), record_ptr);
        priceBTree.insert(priceToInt(record_ptr->price), record_ptr);
    }
    std::string query_string;
    while(std::getline(std::cin, query_string)) {
        try {
            json query = json::parse(query_string);
            std::string query_type = query["queryType"];
            json results = json::array();
            if(query_type == "ticker") {
                for(auto record : records) {
                    if(record->symbol == query["ticker"] || record->name == query["ticker"]) { // linear search due to limitation of tree structure (just iterating through records)
                        json result_json = json::object();
                        result_json["timestamp"] = record->timestamp;
                        result_json["name"] = record->name;
                        result_json["symbol"] = record->symbol;
                        result_json["price"] = record->price;
                        result_json["high"] = record->high;
                        result_json["low"] = record->low;
                        result_json["volume"] = record->volume;
                        result_json["type"] = record->type;
                        results.push_back(result_json);
                    }   
                }
             } else if(query_type == "dateRange") {
                    std::string startDate = query["startDate"];
                    std::string endDate = query["endDate"];
                    auto results_range = timestampBTree.rangeQuery(timetoSeconds(startDate + " 00:00:00"), timetoSeconds(endDate + " 23:59:59"));
                    for(auto result : results_range) {
                        if(results.size() >= max_results) {
                            break;
                        }
                        json result_json = json::object();
                        result_json["timestamp"] = result->timestamp;
                        result_json["name"] = result->name;
                        result_json["symbol"] = result->symbol;
                        result_json["price"] = result->price;
                        result_json["high"] = result->high;
                        result_json["low"] = result->low;
                        result_json["volume"] = result->volume;
                        result_json["type"] = result->type;
                        results.push_back(result_json);
                    }
                } else if(query_type == "priceRange") {
                double minPrice = query["minPrice"];
                double maxPrice = query["maxPrice"];
                auto results_range = priceBTree.rangeQuery(priceToInt(minPrice), priceToInt(maxPrice));
                for(auto result : results_range) {
                    if(results.size() >= max_results) {
                        break;
                    }
                    json result_json = json::object();
                    result_json["timestamp"] = result->timestamp;
                    result_json["name"] = result->name;
                    result_json["symbol"] = result->symbol;
                    result_json["price"] = result->price;
                    result_json["high"] = result->high;
                    result_json["low"] = result->low;
                    result_json["volume"] = result->volume;
                    result_json["type"] = result->type;
                    results.push_back(result_json);
                }
            }
            json response = json::object();
            response["results"] = results;
            response["size"] = records.size();
            response["queryType"] = query_type;
            std::cout << response.dump() << std::endl;
            std::cout.flush();
        } catch (const std::exception& e) {
            std::cerr << "Error: " << e.what() << std::endl;
            json error_response = json::object();
            error_response["error"] = e.what();
            std::cout << error_response.dump() << std::endl;
            std::cout.flush();
        }
    }
    for(auto record_ptr : records) {
        delete record_ptr;
    }
    return 0;
}