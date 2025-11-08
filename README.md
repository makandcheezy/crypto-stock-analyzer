# Stock & Cryptocurrency Analysis tool 

## *Have you ever wanted to query information about a specific stock, general stock prices within the market during a period of time, or find stocks within the same price bracket?*
## ***With this tool, you can!***
  ### Prerequisites: g++, node, data in backend directory  
### To run it:  
Open terminal  
Navigate to the project directory  
cd backend  
g++ -o server server.cpp (to compile the server)  
npm start  

*Open a new terminal*  
cd frontend  
npm start  

Select query type, enter query, and click run query!

### Capabilities:
Search by stock/crypto name (or crypto ticker), price range, or date range (each uses a b/b+-tree indexed respectively.  
Visualize stock data

### Limitations:  
Limited to only 500 output information per query  
Cannot use ticker for stocks (data does not support this)

### Libraries/equations used:  
JSON: https://json.nlohmann.me/  
Express.js: https://expressjs.com/  
CORS: https://github.com/expressjs/cors  
React: https://react.dev/  
g++: https://gcc.gnu.org/  
Recharts: https://recharts.github.io/  
Fowler–Noll–Vo hash function (for name-based indexing)
