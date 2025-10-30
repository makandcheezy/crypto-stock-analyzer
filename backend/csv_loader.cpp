#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>

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

        MarketRecord record;
        record.timestamp = fields[0];
        record.name = fields[1];
        record.symbol = fields[1];

        try {
            record.price = std::stod(fields[2]);
            record.high = std::stod(fields[3]);
            record.low = std::stod(fields[4]);
            record.volume = std::stod(fields[7]);
        } catch (...) {
            continue;
        }

        record.type = "STOCK";
        records.push_back(record);
        count++;
    }

    file.close();
    std::cout << "Loaded " << records.size() << " stock records" << std::endl;
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

        MarketRecord record;
        record.timestamp = fields[0];
        record.name = fields[1];
        record.symbol = fields[2];

        try {
            record.price = std::stod(fields[3]);
            record.high = 0.0;
            record.low = 0.0;
            record.volume = std::stod(fields[5]);
        } catch (...) {
            continue;
        }

        record.type = "CRYPTO";
        records.push_back(record);
        count++;
    }

    file.close();
    std::cout << "Loaded " << records.size() << " crypto records" << std::endl;
    return records;
}

void exportToJSON(const std::string& filename, const std::vector<MarketRecord>& records) {
    std::ofstream file(filename);

    file << "[\n";

    for (size_t i = 0; i < records.size(); i++) {
        const auto& r = records[i];

        file << "  {\n";
        file << "    \"timestamp\": \"" << r.timestamp << "\",\n";
        file << "    \"name\": \"" << r.name << "\",\n";
        file << "    \"symbol\": \"" << r.symbol << "\",\n";
        file << "    \"price\": " << r.price << ",\n";
        file << "    \"high\": " << r.high << ",\n";
        file << "    \"low\": " << r.low << ",\n";
        file << "    \"volume\": " << r.volume << ",\n";
        file << "    \"type\": \"" << r.type << "\"\n";
        file << "  }";

        if (i < records.size() - 1) {
            file << ",";
        }
        file << "\n";
    }

    file << "]\n";

    file.close();
    std::cout << "Exported to " << filename << std::endl;
}

int main() {
    int maxRows = 500;

    std::cout << "CSV to JSON Converter" << std::endl;
    std::cout << "====================" << std::endl;
    std::cout << "Converting up to " << maxRows << " rows from each file...\n" << std::endl;

    auto stockRecords = loadStockData("stocks.csv", maxRows);
    auto cryptoRecords = loadCryptoData("crypto.csv", maxRows);

    std::vector<MarketRecord> allRecords;
    allRecords.insert(allRecords.end(), stockRecords.begin(), stockRecords.end());
    allRecords.insert(allRecords.end(), cryptoRecords.begin(), cryptoRecords.end());

    exportToJSON("market_data.json", allRecords);

    std::cout << "\nTotal records: " << allRecords.size() << std::endl;
    std::cout << "Stock records: " << stockRecords.size() << std::endl;
    std::cout << "Crypto records: " << cryptoRecords.size() << std::endl;
    std::cout << "\nNext step: Copy market_data.json to frontend/public/" << std::endl;

    return 0;
}