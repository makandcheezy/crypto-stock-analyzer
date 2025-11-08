CRYPTO & STOCK MARKET DATA ANALYZER


PREREQUISITES

- C++ compiler with C++17 support
- Node.js (v14+) and npm
- Data files: stocks.csv and crypto.csv in project root


INSTALLATION & RUNNING

1. Compile C++ Backend
   
   g++ -std=c++17 -O3 -o server server.cpp
   
   Note: On Windows, you may need MinGW or WSL to use g++.

2. Install Node.js Dependencies
   
   npm install

3. Start Backend Server
   
   node server.js
   
   Server runs on http://127.0.0.1:8080

4. Start Frontend
   
   cd frontend
   npm install
   npm start
   
   Frontend runs on http://localhost:3000

USAGE

1. Select query type (Ticker, Date Range, or Price Range)
2. Enter parameters (e.g., "Apple", date range, or price range)
3. Click "Run Query"
4. View results and performance comparison
