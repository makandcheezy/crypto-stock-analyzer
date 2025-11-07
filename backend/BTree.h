#include <iostream>
#include <string>
#include <vector>
#include <queue>
struct MarketRecord {
    std::string timestamp;
    std::string name;
    std::string symbol;
    double price;
    double high;
    double low;
    double volume;
    std::string type;
    MarketRecord(std::string timestamp, std::string name, std::string symbol, double price, double high, double low, double volume, std::string type) : timestamp(timestamp), name(name), symbol(symbol), price(price), high(high), low(low), volume(volume), type(type) {}
};
struct TreeNode {
    static const int order = 5; 
    int numKeys;
    int keys[(2*order)-1];
    TreeNode* children[(2*order)];
    bool leaf;
    MarketRecord* data[(2*order)-1];
    TreeNode(bool leaf = false) {
        this->leaf = leaf;
        numKeys = 0;
        for (int i = 0; i < (2*order)-1; i++) {
            keys[i] = 0;
            data[i] = nullptr;
        }
        for(int i = 0; i < (2*order); i++) {
            children[i] = nullptr;
        }
    }
};
class MyBTree {
    TreeNode* root = nullptr; 
    static const int order = 5; // set same order here as in treenode
    static const int minKeys = order-1; 
    static const int maxKeys = 2*order-1;
    MarketRecord* searchHelp(TreeNode* node, int key) { 
        int i = findKeyIndex(node, key); 

        if(i < node->numKeys && node->keys[i] == key) { 
            return node->data[i];
        }
        if(node->leaf) { 
            return nullptr;
        }
        if(node->children[i] != nullptr) { 
            return searchHelp(node->children[i], key);
        }    
        return nullptr; 
    }  
    void rangeQueryHelp(TreeNode* node, int key1, int key2, std::vector<MarketRecord*>& results) {
        if(node == nullptr) {// nothing here
            return;
        }
        int i = findKeyIndex(node, key1); 
        int j = findKeyIndex(node, key2);
        for(int k = i; k <= j && k < node->numKeys; k++) { // adds everything between key1 and key2
            if(node->data[k] != nullptr && node->keys[k] <= key2 && node->keys[k] >= key1) {
            results.push_back(node->data[k]);
            }
        }
        if(node->leaf) {
            return; 
        }
        for(int k = i; k <= j && k < node->numKeys+1; k++) { // goes through children between key1 and key2
            if(node->children[k] != nullptr) { 
            rangeQueryHelp(node->children[k], key1, key2, results);
            }
        }
    }
    void insertHelp(TreeNode* node, int key, MarketRecord* data) { //
        if(node->leaf) { 
            int i = findKeyIndex(node, key); 
            for(int j = node->numKeys-1; j >= i; j--) { 
                node->keys[j+1] = node->keys[j];
                node->data[j+1] = node->data[j];
            }
            node->keys[i] = key; 
            node->data[i] = data; 
            node->numKeys++; 
        } else { 
            int i = findKeyIndex(node, key); // find index where child should be inserted
            if(node->children[i]->numKeys == maxKeys) { // if child has max keys, splits child before visiting
                splitChild(node, i);
                if(key > node->keys[i]) { 
                    i++;
                }
            }
            insertHelp(node->children[i], key, data); 
        }
    }
    void splitChild(TreeNode* node, int index) { 
        TreeNode* child = node->children[index]; 
        TreeNode* newNode = new TreeNode(child->leaf); 
        newNode->numKeys = minKeys; 
        for(int i = 0; i < minKeys; i++) { 
            newNode->keys[i] = child->keys[i+order]; 
            newNode->data[i] = child->data[i+order];
        }
        if(!child->leaf) { 
            for(int i = 0; i < order; i++) {
                newNode->children[i] = child->children[i+order];

            }
        }
        child->numKeys = minKeys; 
        for(int i = node->numKeys; i >= index+1; i--) { // shifts children to the right
            node->children[i+1] = node->children[i];
        }
        node->children[index+1] = newNode; // inserts new node into parent
        for(int i = node->numKeys-1; i >= index; i--) { 
            node->keys[i+1] = node->keys[i];
            node->data[i+1] = node->data[i];
        }
        node->keys[index] = child->keys[minKeys]; 
        node->data[index] = child->data[minKeys];
        node->numKeys++;
    }

    public:
    int findKeyIndex(TreeNode* node, int key) { // find the index of the key in the node (makes it easier to insert and search)
        int i = 0;
        while(i < node->numKeys && key > node->keys[i]) { 
            i++;
        }
        return i;
    }   
    MarketRecord* search(int key) { 
        if(root == nullptr) {
            return nullptr;
        }
        return searchHelp(root, key); 
    }

    std::vector<MarketRecord*> rangeQuery(int key1, int key2) {
        std::vector<MarketRecord*> results;
        if(root == nullptr) {
            return results;
        }
        rangeQueryHelp(root, key1, key2, results);
        return results;
    }

    void insert(int key, MarketRecord* data) {
        if(root == nullptr) { 
            root = new TreeNode(true);
            root->keys[0] = key;
            root->data[0] = data;
            root->numKeys = 1;
        } else { 
            if(root->numKeys == maxKeys) {
                TreeNode* newRoot = new TreeNode(false);
                newRoot->children[0] = root;
                root = newRoot;
                splitChild(root, 0); // splits root node if it has max keys
            } 
                insertHelp(root, key, data); 
        }
    }
    MyBTree() {
        root = nullptr;
    }
    ~MyBTree() { // need a destructor to free memory
        std::queue<TreeNode*> q; // using a queue for breadth-first traversal to delete nodes
        if(root != nullptr) {
            q.push(root);
        }
        while(!q.empty()) {
            TreeNode* curr = q.front();
            q.pop();
            if(!curr->leaf) {
                for(int i = 0; i < curr->numKeys+1; i++) {
                    if(curr->children[i] != nullptr) {
                        q.push(curr->children[i]);
                    }
                }
            delete curr;
            }
        }
    }
    //read mem for ui
private:
    size_t countNodes(TreeNode* n) const {
        if (!n) return 0;
        size_t c = 1;
        if (!n->leaf) {
            for (int i = 0; i <= n->numKeys; ++i)
                c += countNodes(n->children[i]);
        }
        return c;
    }
public:
    size_t approxBytes() const { return countNodes(root) * sizeof(TreeNode); }
};
