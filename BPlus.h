// Created by Isaac Probst on 11/3/2025.
#ifndef BPLUSTREE_BPLUS_H
#define BPLUSTREE_BPLUS_H
#include <algorithm>
#include <iostream>
#include <ranges>
#include <vector>
using namespace std;

    // VAL STRUCT
    struct MarketRecord {
        string timestamp;
        string name;
        string symbol;
        string type;
        double price;
        double high;
        double low;
        double volume;
        MarketRecord(string timestamp,
            string name, string symbol, double price,
            double high, double low, double volume,
            string type) : timestamp(timestamp),
            name(name), symbol(symbol), price(price),
            high(high), low(low), volume(volume), type(type) {}
    };

    // NODE STRUCT
    struct Node {
        bool isLeaf;
        static const int order = 5;
        int keyCount;
        int keys[order-1];
        Node* children[order];
        Node* next;
        MarketRecord* data[order-1];

        Node(bool leaf = false) : isLeaf(leaf), keyCount(0), next(nullptr) {
            for (int i = 0; i < order-1; i++) {
                keys[i] = 0;
                data[i] = nullptr;
            }
            for (int i = 0; i < order; i++) {
                children[i] = nullptr;
            }
        }
    };

// B+ TREE CLASS
class BPlus {
private:
    // VARIABLES AND CONSTRUCTORS
    static const int order = 5;
    static const int maxKeys = order-1;
    static const int minKeys = maxKeys/2;
    Node* root = nullptr;

public:
    // FUNCTIONS
    BPlus() : root(nullptr) {}


    Node* findLeaf(Node* node, int key) {
        if (node == nullptr) {
            return nullptr;
        }
        if (node->isLeaf) {
            return node;
        }
            for (int i = 0; i < node->keyCount; i++) {
                if (key < node->keys[i]) {
                    return findLeaf(node->children[i], key);
                }
            }
        }


    Node* splitLeaf(Node* leaf) {
        int split = leaf->keyCount/2;
        Node* newLeaf = new Node(true);
        newLeaf->next = leaf->next;
        newLeaf->keyCount = leaf->keyCount - split;

        for (int i = 0; i < newLeaf->keyCount; i++) {
            newLeaf->keys[i] = leaf->keys[i + split];
            newLeaf->data[i] = leaf->data[i + split];
        }
        leaf->next = newLeaf;
        leaf->keyCount = split;
        return newLeaf;
    }

    Node* splitInternal(Node* internal) {
        int split = internal->keyCount/2;
        Node* newInternal = new Node(false);
        newInternal->keyCount = internal->keyCount - split - 1;
        internal->keyCount = split;

        for (int i = 0; i < newInternal->keyCount; i++) {
            newInternal->keys[i] = internal->keys[i + split + i];
            newInternal->data[i] = internal->data[i + split + i];
        }
        newInternal->children[newInternal->keyCount] = internal->children[internal->keyCount];
        internal->keyCount = split;
        return newInternal;
    }

    void printTree(Node* node, int level = 0) {
        if(node != nullptr) {
            for (int i = 0; i < level; i++) {
                cout << "  ";
            }
            for (int i = 0; i < node->keyCount; i++) {
                cout << node->keys[i] << " ";
            } cout << endl;
            if (!node->isLeaf) {
            for (int i = 0; i <= node->keyCount; i++) {
                    printTree(node->children[i], level+1);
                }
            }
        } else cout << "Empty Tree" << endl;
    }

    void print() {
        cout << "B+ Tree Print: " << endl;
        printTree(root);
        cout << endl;
    }

    vector<MarketRecord*> rangeQuery(int low, int high, vector<MarketRecord*>& ret) {
        Node* node=root;

        //Find leaf
        while (node != nullptr && !node->isLeaf) {
            int i = 0;
            while (i<node->keyCount && low >= node->keys[i]) {
                i++;
            }
            node = node->children[i];
        }

        //Traverse leaf nodes
        while (node != nullptr) {
            for (int j = 0; j < node->keyCount; j++) {
                if (high >= node->keys[j] && low <= node->keys[j]) {
                    ret.push_back(node->data[j]);
                }
                else if (node->keys[j] > high) {
                    return ret;
                }
            }
            node = node->next;
        }
        return ret;
    }

    int findKeyIndex(Node* node, int key) {
        int i = 0;
        while(i < node->keyCount && key > node->keys[i]) {
            i++;
        }
        return i;
    }

    MarketRecord* search(int key) {
        Node* node=root;

        while (node != nullptr && !node->isLeaf) {
            int i = 0;
            while (i<node->keyCount && key >= node->keys[i]) {
                i++;
            }
            node = node->children[i];
        }

                for (int i = 0; i<node->keyCount; i++) {
                    if (node->keys[i] == key) {
                        return node->data[i];
                    }
                }
        return nullptr;
    }

    void insert(int key, MarketRecord* record) {
        Node* node=root;
        while (node != nullptr) {
            int i = 0;
            while (i<node->keyCount && key > node->keys[i]) {
                i++;
            }
            if (node->isLeaf) {
                if (node->keys[i] > key && i < node->keyCount) {
                    //INSERT
                } else if (i < node->keyCount || key < node->keys[i])

                    return;
                }
            }
            node = node->children[i];
        }
        return;
};


#endif //BPLUSTREE_BPLUS_H