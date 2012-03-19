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
    Stream = require("stream").Stream;


var debug = function() {};
if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.match(/xml/)) {
    debug = function(msg) {
        process.stderr.write("\x1b[32m" + msg + "\x1b[0m"); 
    };
} 


var XmlObjectToStream = exports.XmlObjectToStream = function() {
    Stream.call(this);

    this.readable = true;
    
    this._encoding = "";
    this._stack = []; // stack of nodes that was flushed 
    this._queue = []; // temporary stack of nodes that wait for value
    this._nsIdx = 0;
    
    this._pause = false;
    this._dataQueue = [];
};
util.inherits(XmlObjectToStream, Stream);


XmlObjectToStream.prototype.setEncoding = function(encoding) {
    if (encoding != "utf8")
        throw new Error('Only utf8 is supported in XmlObjectToStream');
    this._encoding = encoding;
};

XmlObjectToStream.prototype.pause = function() {
    process.stderr.write("\x1b[31mpause\x1b[0m");
    this._pause = true;
};

XmlObjectToStream.prototype.resume = function() {
    process.stderr.write("\x1b[31mresume\x1b[0m");
    this._pause = false;
    
    while (this._dataQueue.length) {
        this._data.apply(this, this._dataQueue.shift());
        
        if (this._pause) break;
    }
};

XmlObjectToStream.prototype.destroy = function() {
    
    this.readable = false;
    
    process.nextTick(this.emit.bind(this, "close"));
};

XmlObjectToStream.prototype.destroySoon = XmlObjectToStream.prototype.destroy;


XmlObjectToStream.prototype.xmlDecl = function(callback) {
    this._data('<?xml version="1.0" encoding="UTF-8"?>', callback);
};

XmlObjectToStream.prototype.startElement = function(name, ns, prefix, attr) {
    
    // push element to stack, it will be written out when there comes content
    this._queue.push({
        name: name, 
        ns: ns || ns === "" ? ns : null,
        prefix: prefix || prefix === "" ? prefix : null,
        attr: !!attr,
        empty: true,
        nsDecl: attr ? null : {}
    });
};

XmlObjectToStream.prototype.hintNamespace = function(ns, prefix) {
    
    var top = this._queue[this._queue.length - 1];
    
    top.nsPredef || (top.nsPredef = []);
    top.nsPredef.push({
        ns: ns,
        prefix: prefix || prefix === "" ? prefix : null
    });
};

XmlObjectToStream.prototype.text = function(text, callback) {
    
    var str = "",
        prev = this._stack[this._stack.length - 1] || null,
        el = prev;

    // there comes some text so we have to move elements from queue to stack
    for (var i = 0, len = this._queue.length; i < len; i++) {
        el = this._queue[i];

        // go up the stack to find namespace prefix or generate it 
        var nsDecl = this._makeNsDecl(el);
        
        // make name with ns prefix
        el.qname = (el.prefix ? el.prefix + ":" : "") + el.name;
        
        if (el.attr) {
            str += nsDecl + " " + el.qname + "=\"";
            prev.nsDecl[el.ns] = el.prefix;
        }
        else {
            // previous node is empty so it's open tag wasn't closed yet 
            if (prev && prev.empty) {
                str += ">";
                prev.empty = false;
            }
            
            // sometimes it is good to predefine namespace
            if (el.nsPredef) {
                for (var j = 0; j < el.nsPredef.length; j++) {
                    var elPredef = el.nsPredef[j];
                    
                    nsDecl += this._makeNsDecl(elPredef);
                    el.nsDecl[elPredef.ns] = elPredef.prefix;
                }
            }
            
            // and node open now
            str += "<" + el.qname + nsDecl;
            el.nsDecl[el.ns] = el.prefix;
        }
        
        this._stack.push(el);

        prev = el;
    }
    this._queue.length = 0;
    
    // finally node text or attr value
    if (text !== null) {
        
        // element was empty until now so close it
        if (el.empty && !el.attr) {
            str += ">";
        }
        
        str += escape(text);
        el.empty = false;
    }
        
    this._data(str, callback);
};

XmlObjectToStream.prototype.endElement = function(callback) {
    
    // empty subtree is kept in queue, just take one node from there to ignore
    if (this._queue.pop()) {
        callback && callback();
        return;
    }
    
    // ok so there is no more elements in queue
    // we are on level of elements that we need to close
    var el = this._stack.pop();
    
    var str;
    if (el.attr) {
        str = "\"";
    }
    else if (el.empty) {
        str = "/>";
    } 
    else {
        str = "</" + el.qname + ">";
    }
    
    this._data(str, callback);
};

XmlObjectToStream.prototype.complete = function() {
    
    process.nextTick(this.emit.bind(this, "end"));
    
    this.destroy();
};

XmlObjectToStream.prototype._makeNsDecl = function(obj) {
    
    if (!obj.ns) return "";
    
    // go up the stack to find namespace prefix
    for (var i = this._stack.length - 1; i >= 0; i--) {
        var el = this._stack[i];
        
        if (el.nsDecl && obj.ns in el.nsDecl) {
            obj.prefix = el.nsDecl[obj.ns];
            return "";
        }
    }
    
    // there is no prefix so generate one
    if (obj.prefix === null) {
        obj.prefix = "ns" + ++this._nsIdx;
    }

    // this ns was not declared so prepare declaration             
    return " xmlns" + (obj.prefix ? ":" + obj.prefix : "") 
            + "=\"" + escape(obj.ns) + "\"";
};

XmlObjectToStream.prototype._data = function(str, callback) {
    
    if (this._pause) {
        this._dataQueue.push([str, callback]);
    }
    else {
        debug(str);
        this.emit("data", this._encoding ? str : new Buffer(str));
        callback && callback();
    }
};

var escape = function(string) {
    return string
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&apos;');
};
