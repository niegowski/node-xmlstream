// Copyright (c) 2012 Kuba Niegowski
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

"use strict";

var util = require("util"),
    events = require("events"),
    expat = require("node-expat");


var Parser = exports.Parser = function() {
    events.EventEmitter.call(this);

    this._ns = [];
    this._parser = new expat.Parser("UTF-8");

    this._parser.on("startElement", this._startElement.bind(this));
    this._parser.on("endElement", this._endElement.bind(this));
    this._parser.on("text", this._text.bind(this));
};
util.inherits(Parser, events.EventEmitter);


Parser.prototype.destroy = function() {
    
    this._parser = null;
};

Parser.prototype.parse = function(string, end) {
    
    if (!this._parser.parse(string, end)) {
        var err = this._parser.getError();
        
        process.nextTick(function() {
            this.emit("error", new Error("Expat: " + err));
            this.destroy();
        }.bind(this));
    }
};

Parser.prototype.pause = function() {
    this._parser.pause();
};

Parser.prototype.resume = function() {
    this._parser.resume();
};

Parser.prototype._startElement = function(name, attrs) {

    var parentNSs = this._ns.length ? this._ns[this._ns.length-1] : null,
        localNSs = {};
        
    this._ns.push(localNSs);

    if (parentNSs && parentNSs["$"])
        localNSs["$"] = parentNSs["$"];
    
    for (var attr in attrs) {
        if (attr == "xmlns") {
            localNSs["$"] = attrs[attr];
            delete attrs[attr];
        } else if (attr.substr(0, 6) == "xmlns:") {
            localNSs[attr.substr(6)] = attrs[attr];
            delete attrs[attr];
        }
    }
    
    this._handleName(name);
    
    if (attrs) {
        for (var attr in attrs) {
            this._handleName(attr, true);
            this.emit("text", attrs[attr]);
            this._handleEnd();
        }
    }
};

Parser.prototype._endElement = function(name) {
    this._handleEnd();
    this._ns.pop();
};

Parser.prototype._text = function(string) {
    string = string.trim();
    if (string) {
        this.emit("text", string);
    }
};

Parser.prototype.resolveNamespace = function(prefix) {
    
    for (var i = this._ns.length - 1; i >= 0; i--) {
        if (prefix in this._ns[i])
            return this._ns[i][prefix];
    }
    return prefix;
};

Parser.prototype._handleName = function(name, attr) {
    
    var nsURI = this._ns[this._ns.length - 1]["$"],
        prefix = "";
    
    name = name.split(":");
    if (name.length == 1) {
        name = name[0];
    } else {
        nsURI = this.resolveNamespace(prefix = name.shift());
        name = name.join();
    }
    
    this.emit("startElement", name, nsURI, prefix, attr);
};

Parser.prototype._handleEnd = function() {
    
    this.emit("endElement");
};
