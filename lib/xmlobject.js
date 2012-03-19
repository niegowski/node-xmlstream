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

var XmlObject = exports.XmlObject = function(name, ns, prefix, attr) {

    this.name = name;
    this.ns = ns || "";
    this.prefix = prefix || prefix === "" ? prefix : null;
    
    this._attr = attr || false;

    this._attrs = null;
    this._values = null;
    
    this._nsPredef = {};
};

XmlObject.prototype.defElements = function(names, ns, prefix) {

    ns = ns || this.ns;

    for (var i = 0, len = names.length; i < len; i++) {
        var name = names[i];

        this._defElemProperty(name, ns, prefix);
    }
    
    if (ns && ns != this.ns) {
        this._nsPredef[ns] = prefix;
    }
};

XmlObject.prototype.defAttribute = function(name, ns, prefix) {

    var obj = new XmlObject(name, 
        ns || ns === "" ? ns : this.ns, 
        prefix || prefix === "" ? prefix : this.prefix, 
        true
    );
        
    (this._attrs || (this._attrs = [])).push(obj)

    Object.defineProperty(this, name, {
        get: function() {
            return obj.getValue();
        },
        set: function(value) {
            obj.setValue(value);
        }
    });
    
    if (ns && ns != this.ns) {
        this._nsPredef[ns] = prefix;
    }
    
    return obj;
};

XmlObject.prototype.defAttributes = function(names, ns, prefix) {

    for (var i = 0, len = names.length; i < len; i++)
        var last = this.defAttribute(names[i], ns, prefix);
    
    return last;
};

XmlObject.prototype.getAttribute = function(name, ns) {

    if (this._attrs) {
        for (var i = 0, len = this._attrs.length; i < len; i++) {
            var attr = this._attrs[i];
            
            if (attr.name == name && attr.ns == ns)
                return attr;
        }
    }
    return null;
};

XmlObject.prototype.getValue = function() {
    
    var ret = null;
    
    if (this._values) {
        for (var i = 0, len = this._values.length; i < len; i++) {
            var value = this._values[i];
            
            if (!(value instanceof XmlObject)) {
                if (ret === null) 
                    ret = "";
                ret += value;
            }
        }
    }
    
    return ret;
};

XmlObject.prototype.setValue = function(value) {
    
    if (this._attr) {
        if (value instanceof XmlObject)
            throw new Error("Can't set XmlObject value to attribute");
            
        this._values = [value];
    }
    else {
        if (value instanceof XmlObject && !(value.name in this)) {
            this._defElemProperty(value.name, value.ns);
        }
        
        (this._values || (this._values = [])).push(value);
    }
    
    return this;
};

XmlObject.prototype._complete = function() {
    // override to handle deserialization complete
};

XmlObject.prototype._setElement = function(name, ns, prefix, value) {
    this.setValue(new XmlObject(name, ns, prefix).setValue(value));
};

XmlObject.prototype._getElement = function(name, ns) {
    
    var ret = [];
    
    if (this._values) {
        for (var i = 0, len = this._values.length; i < len; i++) {
            var obj = this._values[i];
            
            if (obj.name == name && obj.ns == ns)
                ret.push(obj);
        }
    }
    
    return ret;
};

XmlObject.prototype._defElemProperty = function(name, ns, prefix) {

    Object.defineProperty(this, name, {

        get: function() {
            return this._getElement(name, 
                ns || ns === "" ? ns : this.ns
            );
        }.bind(this),

        set: function(value) { 
            this._setElement(name, 
                ns || ns === "" ? ns : this.ns, 
                prefix || prefix === "" ? prefix : this.prefix, 
                value
            );
        }.bind(this)
        
    });
};

XmlObject.prototype.streamTo = function(xmlStream) {
    
    process.nextTick(function() {
        xmlStream.xmlDecl(
            this._streamNode.bind(this, xmlStream, 
                xmlStream.complete.bind(xmlStream)
            )
        )
    }.bind(this));
};

XmlObject.prototype._streamNode = function(xmlStream, callback) {

    this._streamOpen(xmlStream,  
        this._streamAttribs.bind(this, xmlStream,  
            this._streamChildren.bind(this, xmlStream, 
                this._streamClose.bind(this, xmlStream, callback)
            )
        )
    );
};

XmlObject.prototype._streamOpen = function(xmlStream, callback) {

    xmlStream.startElement(this.name, this.ns, this.prefix, this._attr);

    if (this._nsPredef) {
        for (var ns in this._nsPredef) {
            xmlStream.hintNamespace(ns, this._nsPredef[ns]);
        }
    }
    
    callback();
};

XmlObject.prototype._streamAttribs = function(xmlStream, callback) {

    var len = this._attrs ? this._attrs.length : 0,
        i = 0;

    var step = function() {
        if (i < len) {
            this._attrs[i++]._streamNode(xmlStream, step);
        }
        else {
            callback();
        }
    }.bind(this);
    
    step();
};

XmlObject.prototype._streamChildren = function(xmlStream, callback) {

    var len = this._values ? this._values.length : 0,
        i = 0;
    
    var step = function() {
        if (i < len) {
            var el = this._values[i++];
        
            if (el !== null) {
                if (el instanceof XmlObject) {
                    el._streamNode(xmlStream, step);
                }
                else {
                    xmlStream.text(el.toString(), step);
                }
            }
            else {
                step();
            }
        }
        else {
            callback();
        }
    }.bind(this);
        
    step();
};

XmlObject.prototype._streamClose = function(xmlStream, callback) {
    
    xmlStream.endElement(callback);
};

var numCall = function(cnt, callback) {
    return cnt ? function() {
        --cnt || callback();
    } : callback;
};
