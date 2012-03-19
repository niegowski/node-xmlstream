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
    expat = require("node-expat"),
    Stream = require("stream").Stream,
    Parser = require("./parser").Parser,
    XmlObject = require('./xmlobject').XmlObject;


var debug = function() {};
if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.match(/xml/)) {
    debug = function(msg) {
        process.stderr.write("\x1b[33m" + msg + "\x1b[0m"); 
    };
} 


var XmlStreamToObject = exports.XmlStreamToObject = function() {
    Stream.call(this);

    this.writable = true;
    
    this._parser = new Parser();
    
    this._parser.on("startElement", this._startElement.bind(this));
    this._parser.on("endElement", this._endElement.bind(this));
    this._parser.on("text", this._text.bind(this));

    this._parser.on("error", function(err) {
        this.emit("error", err);
        this.destroy();
    }.bind(this));
    
    this._objects = {};
    this._stack = [];
    
    this._queue = [];
    this._pause = false;
};
util.inherits(XmlStreamToObject, Stream);

XmlStreamToObject.prototype.register = function(objDef) {
    
    var obj = new objDef();
    this._objects[obj.ns + "$$$" + obj.name] = objDef;
};

XmlStreamToObject.prototype.write = function(string, encoding) {
    
    if (encoding && encoding != "uft8")
        throw new Error("Cant handle non UTF-8 data");

    if (typeof string != "string")
        string = string.toString();
    
    this._queue.push(string);
    return this._flush();
};

XmlStreamToObject.prototype.end = function(string, encoding) {

    if (encoding && encoding != "uft8")
        throw new Error("Cant handle non UTF-8 data");
    
    string = string || "";
    
    if (typeof string != "string")
        string = string.toString();
    
    this._queue.push(string);
    this._queue.push(null);
    this._flush();
};

XmlStreamToObject.prototype.destroy = function() {
    
    this._parser.destroy();
    
    this.writable = false;
    this._parser = null;
    this._ns = null;
    
    process.nextTick(this.emit.bind(this, "close"));
};

XmlStreamToObject.prototype.pause = function() {
    this._pause = true;
    this._parser.pause();
};

XmlStreamToObject.prototype.resume = function() {
    // resume must not be called in expat handler
    process.nextTick(this._resume.bind(this));
};

XmlStreamToObject.prototype._resume = function() {
    this._pause = false;
    this._parser.resume();
    this._flush();
};

XmlStreamToObject.prototype.destroySoon = XmlStreamToObject.prototype.end;


XmlStreamToObject.prototype._flush = function() {
    
    while (!this._pause && this._queue.length) {
        
        var string = this._queue.shift();
        
        if (string !== null) {
            debug(string);
            this._parser.parse(string);
        }
        else {
            this._parser.parse("", true);
            this.destroy();
        }
    }
    return !this._queue.length;
};




XmlStreamToObject.prototype._startElement = function(name, ns, prefix, attr) {
    
    var top = this._stack[this._stack.length - 1];
    
    if (attr) {
        this._stack.push({ attr: name, ns: ns, prefix: prefix });
    }
    else {
        var objDef = this._objects[ns + "$$$" + name],
            obj = objDef ? new objDef() : new XmlObject(name, ns, prefix);

        this.emit("nodeOpen", obj);

        top && top.setValue(obj);
        this._stack.push(obj);
    }
};

XmlStreamToObject.prototype._endElement = function() {
    
    var top = this._stack.pop();
    
    if (top instanceof XmlObject) {
        if (top._complete() !== false)
            this.emit("node", top);
    }
    if (this._stack.length == 0)
        this.emit("complete");
};

XmlStreamToObject.prototype._text = function(text) {
    
    var top = this._stack[this._stack.length - 1];
    
    if (top instanceof XmlObject) {
        
        top.setValue(text);
        this.emit("nodeText", top);
    }
    else {
        // attribute
        var prev = this._stack[this._stack.length - 2],
            attr = prev.getAttribute(top.attr, top.ns)
                || prev.defAttribute(top.attr, top.ns, top.prefix);

        attr.setValue(text);
    }
};
