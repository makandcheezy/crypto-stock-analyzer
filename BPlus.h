// Created by Isaac Probst on 11/3/2025.
#ifndef BPLUSTREE_BPLUS_H
#define BPLUSTREE_BPLUS_H
#include <algorithm>
#include <iostream>
#include <ranges>
#include <vector>
using namespace std;


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


    //scans tree to find the leaf node of the given node
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
        return findLeaf(node->children[node->keyCount], key);
    }


    //split for leaves, maintains linkedlist
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
        newLeaf->next = leaf->next;
        leaf->keyCount = split;
        return newLeaf;
    }

    //for internal nodes
    Node* splitInternal(Node* internal) {
        int split = internal->keyCount/2;
        Node* newInternal = new Node(false);

        newInternal->keyCount = internal->keyCount - split - 1;
        internal->keyCount = split;

        for (int i = 0; i < newInternal->keyCount; i++) {
            newInternal->keys[i] = internal->keys[split+i+1];
            newInternal->children[i] = internal->children[split +i+1];
        }
        newInternal->children[newInternal->keyCount] = internal->children[internal->keyCount];
        internal->keyCount = split;
        return newInternal;
    }

    //print for testing
    void printTree(Node* node, int level = 0) {
        if(node != nullptr) {
            for (int i =0; i < level; i++) {
                cout << "  ";
            }
            for (int i = 0; i < node->keyCount; i++) {
                cout << node->keys[i] << " ";
            } cout << endl;
            if (!node->isLeaf) {
                for (int i = 0; i <= node->keyCount; i++) {
                    printTree(node->children[i], level+ 1);
                }
            }
        } else cout << "B+ Tree Is Empty!!" << endl;
    }

    //public print
    void print() {
        cout << "B+ Tree Print: " << endl;
        printTree(root);
        cout << endl;
    }

    // RANGE QUERY - gives nodes between a certain index, O(logn) complexity
    vector<MarketRecord*> rangeQuery(int low, int high) {
        vector<MarketRecord*>& ret;
        Node* node=root;

        //find leaf
        while (node != nullptr && !node->isLeaf) {
            int i = 0;
            while (i<node->keyCount && low >= node->keys[i]) {
                i++;
            }
            node = node->children[i];
        }

        //traverse leaf nodes
        while (node != nullptr) {
            for (int j = 0; j < node->keyCount; j++ ) {
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
            int i =0;
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

    //inserts a record into B+, splitting as necessary with helper function
    void insert(int key, MarketRecord* record) {
        if (root==nullptr) {
            root = new Node(true);
            root->keys[0] = key;
            root->keyCount = 1;
            root->data[0] = record;
            return;
        } else {
            //new root
            if (root->keyCount == maxKeys) {
                Node* newRoot = new Node(false);

                newRoot->children[0] = root;
                Node* newLeaf = splitLeaf(root);
                newRoot->children[1] = newLeaf;
                newRoot->keyCount = 1;
                newRoot->keys[0] = newLeaf->keys[0];
                root = newRoot;
                insertHelper(root, key, record);
            } else {
                //root is not full
                insertHelper(root,key,record);
            }
        }
    }

    //recursive helper for insert function
    void insertHelper(Node*node, int key, MarketRecord* record) {

if (node->isLeaf) {
    int i = node->keyCount-1;
    while (i >= 0 && key < node->keys[i]) {
        node->keys[i + 1] = node->keys[i];
        node->data[i+1] = node->data[i];
        i--;
    }
    node->keys[i+1] = key;
    node->data[i+1] = record;
    node->keyCount = node->keyCount + 1;
} else {
    int j = findKeyIndex(node, key);
    Node* child = node->children[j];

    //split if full
    if (child->keyCount == maxKeys) {
        Node* newChild = splitLeaf(child);
        for (int k = node->keyCount; k > j; k--) {
            node->keys[k] = node->keys[k-1];
            node->children[k + 1] = node->children[k];
        }
        node->keyCount = node->keyCount + 1;
        node->keys[j] = newChild->keys[j];
        node->children[j+1] = newChild;

        if (key >= node->keys[j]) {
            child=newChild;
        }
    }
    insertHelper(child, key, record);
}
    }
};




#endif //BPLUSTREE_BPLUS_H