/**
 * almond 0.2.6 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());


// Copyright 2009-2012 by contributors, MIT License
// vim: ts=4 sts=4 sw=4 expandtab

// Module systems magic dance
(function (definition) {
    // RequireJS
    if (typeof define == "function") {
        define('es5shim',definition);
    // YUI3
    } else if (typeof YUI == "function") {
        YUI.add("es5", definition);
    // CommonJS and <script>
    } else {
        definition();
    }
})(function () {

/**
 * Brings an environment as close to ECMAScript 5 compliance
 * as is possible with the facilities of erstwhile engines.
 *
 * Annotated ES5: http://es5.github.com/ (specific links below)
 * ES5 Spec: http://www.ecma-international.org/publications/files/ECMA-ST/Ecma-262.pdf
 * Required reading: http://javascriptweblog.wordpress.com/2011/12/05/extending-javascript-natives/
 */

//
// Function
// ========
//

// ES-5 15.3.4.5
// http://es5.github.com/#x15.3.4.5

function Empty() {}

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        // 1. Let Target be the this value.
        var target = this;
        // 2. If IsCallable(Target) is false, throw a TypeError exception.
        if (typeof target != "function") {
            throw new TypeError("Function.prototype.bind called on incompatible " + target);
        }
        // 3. Let A be a new (possibly empty) internal list of all of the
        //   argument values provided after thisArg (arg1, arg2 etc), in order.
        // XXX slicedArgs will stand in for "A" if used
        var args = _Array_slice_.call(arguments, 1); // for normal call
        // 4. Let F be a new native ECMAScript object.
        // 11. Set the [[Prototype]] internal property of F to the standard
        //   built-in Function prototype object as specified in 15.3.3.1.
        // 12. Set the [[Call]] internal property of F as described in
        //   15.3.4.5.1.
        // 13. Set the [[Construct]] internal property of F as described in
        //   15.3.4.5.2.
        // 14. Set the [[HasInstance]] internal property of F as described in
        //   15.3.4.5.3.
        var bound = function () {

            if (this instanceof bound) {
                // 15.3.4.5.2 [[Construct]]
                // When the [[Construct]] internal method of a function object,
                // F that was created using the bind function is called with a
                // list of arguments ExtraArgs, the following steps are taken:
                // 1. Let target be the value of F's [[TargetFunction]]
                //   internal property.
                // 2. If target has no [[Construct]] internal method, a
                //   TypeError exception is thrown.
                // 3. Let boundArgs be the value of F's [[BoundArgs]] internal
                //   property.
                // 4. Let args be a new list containing the same values as the
                //   list boundArgs in the same order followed by the same
                //   values as the list ExtraArgs in the same order.
                // 5. Return the result of calling the [[Construct]] internal
                //   method of target providing args as the arguments.

                var result = target.apply(
                    this,
                    args.concat(_Array_slice_.call(arguments))
                );
                if (Object(result) === result) {
                    return result;
                }
                return this;

            } else {
                // 15.3.4.5.1 [[Call]]
                // When the [[Call]] internal method of a function object, F,
                // which was created using the bind function is called with a
                // this value and a list of arguments ExtraArgs, the following
                // steps are taken:
                // 1. Let boundArgs be the value of F's [[BoundArgs]] internal
                //   property.
                // 2. Let boundThis be the value of F's [[BoundThis]] internal
                //   property.
                // 3. Let target be the value of F's [[TargetFunction]] internal
                //   property.
                // 4. Let args be a new list containing the same values as the
                //   list boundArgs in the same order followed by the same
                //   values as the list ExtraArgs in the same order.
                // 5. Return the result of calling the [[Call]] internal method
                //   of target providing boundThis as the this value and
                //   providing args as the arguments.

                // equiv: target.call(this, ...boundArgs, ...args)
                return target.apply(
                    that,
                    args.concat(_Array_slice_.call(arguments))
                );

            }

        };
        if(target.prototype) {
            Empty.prototype = target.prototype;
            bound.prototype = new Empty();
            // Clean up dangling references.
            Empty.prototype = null;
        }
        // XXX bound.length is never writable, so don't even try
        //
        // 15. If the [[Class]] internal property of Target is "Function", then
        //     a. Let L be the length property of Target minus the length of A.
        //     b. Set the length own property of F to either 0 or L, whichever is
        //       larger.
        // 16. Else set the length own property of F to 0.
        // 17. Set the attributes of the length own property of F to the values
        //   specified in 15.3.5.1.

        // TODO
        // 18. Set the [[Extensible]] internal property of F to true.

        // TODO
        // 19. Let thrower be the [[ThrowTypeError]] function Object (13.2.3).
        // 20. Call the [[DefineOwnProperty]] internal method of F with
        //   arguments "caller", PropertyDescriptor {[[Get]]: thrower, [[Set]]:
        //   thrower, [[Enumerable]]: false, [[Configurable]]: false}, and
        //   false.
        // 21. Call the [[DefineOwnProperty]] internal method of F with
        //   arguments "arguments", PropertyDescriptor {[[Get]]: thrower,
        //   [[Set]]: thrower, [[Enumerable]]: false, [[Configurable]]: false},
        //   and false.

        // TODO
        // NOTE Function objects created using Function.prototype.bind do not
        // have a prototype property or the [[Code]], [[FormalParameters]], and
        // [[Scope]] internal properties.
        // XXX can't delete prototype in pure-js.

        // 22. Return F.
        return bound;
    };
}

// Shortcut to an often accessed properties, in order to avoid multiple
// dereference that costs universally.
// _Please note: Shortcuts are defined after `Function.prototype.bind` as we
// us it in defining shortcuts.
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var _Array_slice_ = prototypeOfArray.slice;
// Having a toString local variable name breaks in Opera so use _toString.
var _toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);

// If JS engine supports accessors creating shortcuts.
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}

//
// Array
// =====
//

// ES5 15.4.4.12
// http://es5.github.com/#x15.4.4.12
// Default value for second param
// [bugfix, ielt9, old browsers]
// IE < 9 bug: [1,2].splice(0).join("") == "" but should be "12"
if ([1,2].splice(0).length != 2) {
    var array_splice = Array.prototype.splice;

    if(function() { // test IE < 9 to splice bug - see issue #138
        function makeArray(l) {
            var a = [];
            while (l--) {
                a.unshift(l)
            }
            return a
        }

        var array = []
            , lengthBefore
        ;

        array.splice.bind(array, 0, 0).apply(null, makeArray(20));
        array.splice.bind(array, 0, 0).apply(null, makeArray(26));

        lengthBefore = array.length; //20
        array.splice(5, 0, "XXX"); // add one element

        if(lengthBefore + 1 == array.length) {
            return true;// has right splice implementation without bugs
        }
        // else {
        //    IE8 bug
        // }
    }()) {//IE 6/7
        Array.prototype.splice = function(start, deleteCount) {
            if (!arguments.length) {
                return [];
            } else {
                return array_splice.apply(this, [
                    start === void 0 ? 0 : start,
                    deleteCount === void 0 ? (this.length - start) : deleteCount
                ].concat(_Array_slice_.call(arguments, 2)))
            }
        };
    }
    else {//IE8
        Array.prototype.splice = function(start, deleteCount) {
            var result
                , args = _Array_slice_.call(arguments, 2)
                , addElementsCount = args.length
            ;

            if(!arguments.length) {
                return [];
            }

            if(start === void 0) { // default
                start = 0;
            }
            if(deleteCount === void 0) { // default
                deleteCount = this.length - start;
            }

            if(addElementsCount > 0) {
                if(deleteCount <= 0) {
                    if(start == this.length) { // tiny optimisation #1
                        this.push.apply(this, args);
                        return [];
                    }

                    if(start == 0) { // tiny optimisation #2
                        this.unshift.apply(this, args);
                        return [];
                    }
                }

                // Array.prototype.splice implementation
                result = _Array_slice_.call(this, start, start + deleteCount);// delete part
                args.push.apply(args, _Array_slice_.call(this, start + deleteCount, this.length));// right part
                args.unshift.apply(args, _Array_slice_.call(this, 0, start));// left part

                // delete all items from this array and replace it to 'left part' + _Array_slice_.call(arguments, 2) + 'right part'
                args.unshift(0, this.length);

                array_splice.apply(this, args);

                return result;
            }

            return array_splice.call(this, start, deleteCount);
        }

    }
}

// ES5 15.4.4.12
// http://es5.github.com/#x15.4.4.13
// Return len+argCount.
// [bugfix, ielt8]
// IE < 8 bug: [].unshift(0) == undefined but should be "1"
if ([].unshift(0) != 1) {
    var array_unshift = Array.prototype.unshift;
    Array.prototype.unshift = function() {
        array_unshift.apply(this, arguments);
        return this.length;
    };
}

// ES5 15.4.3.2
// http://es5.github.com/#x15.4.3.2
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/isArray
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return _toString(obj) == "[object Array]";
    };
}

// The IsCallable() check in the Array functions
// has been replaced with a strict check on the
// internal class of the object to trap cases where
// the provided function was actually a regular
// expression literal, which in V8 and
// JavaScriptCore is a typeof "function".  Only in
// V8 are regular expression literals permitted as
// reduce parameters, so it is desirable in the
// general case for the shim to match the more
// strict and common behavior of rejecting regular
// expressions.

// ES5 15.4.4.18
// http://es5.github.com/#x15.4.4.18
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/array/forEach

// Check failure of by-index access of string characters (IE < 9)
// and failure of `0 in boxedString` (Rhino)
var boxedString = Object("a"),
    splitString = boxedString[0] != "a" || !(0 in boxedString);

if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            thisp = arguments[1],
            i = -1,
            length = self.length >>> 0;

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (++i < length) {
            if (i in self) {
                // Invoke the callback function with call, passing arguments:
                // context, property value, property key, thisArg object
                // context
                fun.call(thisp, self[i], i, object);
            }
        }
    };
}

// ES5 15.4.4.19
// http://es5.github.com/#x15.4.4.19
// https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/map
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, object);
        }
        return result;
    };
}

// ES5 15.4.4.20
// http://es5.github.com/#x15.4.4.20
// https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/filter
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                    object,
            length = self.length >>> 0,
            result = [],
            value,
            thisp = arguments[1];

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self) {
                value = self[i];
                if (fun.call(thisp, value, i, object)) {
                    result.push(value);
                }
            }
        }
        return result;
    };
}

// ES5 15.4.4.16
// http://es5.github.com/#x15.4.4.16
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/every
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, object)) {
                return false;
            }
        }
        return true;
    };
}

// ES5 15.4.4.17
// http://es5.github.com/#x15.4.4.17
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/some
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, object)) {
                return true;
            }
        }
        return false;
    };
}

// ES5 15.4.4.21
// http://es5.github.com/#x15.4.4.21
// https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/reduce
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        // no value to return if no initial value and an empty array
        if (!length && arguments.length == 1) {
            throw new TypeError("reduce of empty array with no initial value");
        }

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }

                // if array contains no values, no initial value to return
                if (++i >= length) {
                    throw new TypeError("reduce of empty array with no initial value");
                }
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        }

        return result;
    };
}

// ES5 15.4.4.22
// http://es5.github.com/#x15.4.4.22
// https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/reduceRight
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;

        // If no callback function or if callback is not a callable function
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        // no value to return if no initial value, empty array
        if (!length && arguments.length == 1) {
            throw new TypeError("reduceRight of empty array with no initial value");
        }

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }

                // if array contains no values, no initial value to return
                if (--i < 0) {
                    throw new TypeError("reduceRight of empty array with no initial value");
                }
            } while (true);
        }

        if (i < 0) {
            return result;
        }

        do {
            if (i in this) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        } while (i--);

        return result;
    };
}

// ES5 15.4.4.14
// http://es5.github.com/#x15.4.4.14
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf || ([0, 1].indexOf(1, 2) != -1)) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }

        var i = 0;
        if (arguments.length > 1) {
            i = toInteger(arguments[1]);
        }

        // handle negative indices
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}

// ES5 15.4.4.15
// http://es5.github.com/#x15.4.4.15
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/lastIndexOf
if (!Array.prototype.lastIndexOf || ([0, 1].lastIndexOf(0, -3) != -1)) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }
        var i = length - 1;
        if (arguments.length > 1) {
            i = Math.min(i, toInteger(arguments[1]));
        }
        // handle negative indices
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i]) {
                return i;
            }
        }
        return -1;
    };
}

//
// Object
// ======
//

// ES5 15.2.3.14
// http://es5.github.com/#x15.2.3.14
if (!Object.keys) {
    // http://whattheheadsaid.com/2010/10/a-safer-object-keys-compatibility-implementation
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null}) {
        hasDontEnumBug = false;
    }

    Object.keys = function keys(object) {

        if (
            (typeof object != "object" && typeof object != "function") ||
            object === null
        ) {
            throw new TypeError("Object.keys called on a non-object");
        }

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }
        return keys;
    };

}

//
// Date
// ====
//

// ES5 15.9.5.43
// http://es5.github.com/#x15.9.5.43
// This function returns a String value represent the instance in time
// represented by this Date object. The format of the String is the Date Time
// string format defined in 15.9.1.15. All fields are present in the String.
// The time zone is always UTC, denoted by the suffix Z. If the time value of
// this object is not a finite Number a RangeError exception is thrown.
var negativeDate = -62198755200000,
    negativeYearString = "-000001";
if (
    !Date.prototype.toISOString ||
    (new Date(negativeDate).toISOString().indexOf(negativeYearString) === -1)
) {
    Date.prototype.toISOString = function toISOString() {
        var result, length, value, year, month;
        if (!isFinite(this)) {
            throw new RangeError("Date.prototype.toISOString called on non-finite value.");
        }

        year = this.getUTCFullYear();

        month = this.getUTCMonth();
        // see https://github.com/kriskowal/es5-shim/issues/111
        year += Math.floor(month / 12);
        month = (month % 12 + 12) % 12;

        // the date time string format is specified in 15.9.1.15.
        result = [month + 1, this.getUTCDate(),
            this.getUTCHours(), this.getUTCMinutes(), this.getUTCSeconds()];
        year = (
            (year < 0 ? "-" : (year > 9999 ? "+" : "")) +
            ("00000" + Math.abs(year))
            .slice(0 <= year && year <= 9999 ? -4 : -6)
        );

        length = result.length;
        while (length--) {
            value = result[length];
            // pad months, days, hours, minutes, and seconds to have two
            // digits.
            if (value < 10) {
                result[length] = "0" + value;
            }
        }
        // pad milliseconds to have three digits.
        return (
            year + "-" + result.slice(0, 2).join("-") +
            "T" + result.slice(2).join(":") + "." +
            ("000" + this.getUTCMilliseconds()).slice(-3) + "Z"
        );
    };
}


// ES5 15.9.5.44
// http://es5.github.com/#x15.9.5.44
// This function provides a String representation of a Date object for use by
// JSON.stringify (15.12.3).
var dateToJSONIsSupported = false;
try {
    dateToJSONIsSupported = (
        Date.prototype.toJSON &&
        new Date(NaN).toJSON() === null &&
        new Date(negativeDate).toJSON().indexOf(negativeYearString) !== -1 &&
        Date.prototype.toJSON.call({ // generic
            toISOString: function () {
                return true;
            }
        })
    );
} catch (e) {
}
if (!dateToJSONIsSupported) {
    Date.prototype.toJSON = function toJSON(key) {
        // When the toJSON method is called with argument key, the following
        // steps are taken:

        // 1.  Let O be the result of calling ToObject, giving it the this
        // value as its argument.
        // 2. Let tv be toPrimitive(O, hint Number).
        var o = Object(this),
            tv = toPrimitive(o),
            toISO;
        // 3. If tv is a Number and is not finite, return null.
        if (typeof tv === "number" && !isFinite(tv)) {
            return null;
        }
        // 4. Let toISO be the result of calling the [[Get]] internal method of
        // O with argument "toISOString".
        toISO = o.toISOString;
        // 5. If IsCallable(toISO) is false, throw a TypeError exception.
        if (typeof toISO != "function") {
            throw new TypeError("toISOString property is not callable");
        }
        // 6. Return the result of calling the [[Call]] internal method of
        //  toISO with O as the this value and an empty argument list.
        return toISO.call(o);

        // NOTE 1 The argument is ignored.

        // NOTE 2 The toJSON function is intentionally generic; it does not
        // require that its this value be a Date object. Therefore, it can be
        // transferred to other kinds of objects for use as a method. However,
        // it does require that any such object have a toISOString method. An
        // object is free to use the argument key to filter its
        // stringification.
    };
}

// ES5 15.9.4.2
// http://es5.github.com/#x15.9.4.2
// based on work shared by Daniel Friesen (dantman)
// http://gist.github.com/303249
if (!Date.parse || "Date.parse is buggy") {
    // XXX global assignment won't work in embeddings that use
    // an alternate object for the context.
    Date = (function(NativeDate) {

        // Date.length === 7
        function Date(Y, M, D, h, m, s, ms) {
            var length = arguments.length;
            if (this instanceof NativeDate) {
                var date = length == 1 && String(Y) === Y ? // isString(Y)
                    // We explicitly pass it through parse:
                    new NativeDate(Date.parse(Y)) :
                    // We have to manually make calls depending on argument
                    // length here
                    length >= 7 ? new NativeDate(Y, M, D, h, m, s, ms) :
                    length >= 6 ? new NativeDate(Y, M, D, h, m, s) :
                    length >= 5 ? new NativeDate(Y, M, D, h, m) :
                    length >= 4 ? new NativeDate(Y, M, D, h) :
                    length >= 3 ? new NativeDate(Y, M, D) :
                    length >= 2 ? new NativeDate(Y, M) :
                    length >= 1 ? new NativeDate(Y) :
                                  new NativeDate();
                // Prevent mixups with unfixed Date object
                date.constructor = Date;
                return date;
            }
            return NativeDate.apply(this, arguments);
        };

        // 15.9.1.15 Date Time String Format.
        var isoDateExpression = new RegExp("^" +
            "(\\d{4}|[\+\-]\\d{6})" + // four-digit year capture or sign +
                                      // 6-digit extended year
            "(?:-(\\d{2})" + // optional month capture
            "(?:-(\\d{2})" + // optional day capture
            "(?:" + // capture hours:minutes:seconds.milliseconds
                "T(\\d{2})" + // hours capture
                ":(\\d{2})" + // minutes capture
                "(?:" + // optional :seconds.milliseconds
                    ":(\\d{2})" + // seconds capture
                    "(?:(\\.\\d{1,}))?" + // milliseconds capture
                ")?" +
            "(" + // capture UTC offset component
                "Z|" + // UTC capture
                "(?:" + // offset specifier +/-hours:minutes
                    "([-+])" + // sign capture
                    "(\\d{2})" + // hours offset capture
                    ":(\\d{2})" + // minutes offset capture
                ")" +
            ")?)?)?)?" +
        "$");

        var months = [
            0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365
        ];

        function dayFromMonth(year, month) {
            var t = month > 1 ? 1 : 0;
            return (
                months[month] +
                Math.floor((year - 1969 + t) / 4) -
                Math.floor((year - 1901 + t) / 100) +
                Math.floor((year - 1601 + t) / 400) +
                365 * (year - 1970)
            );
        }

        // Copy any custom methods a 3rd party library may have added
        for (var key in NativeDate) {
            Date[key] = NativeDate[key];
        }

        // Copy "native" methods explicitly; they may be non-enumerable
        Date.now = NativeDate.now;
        Date.UTC = NativeDate.UTC;
        Date.prototype = NativeDate.prototype;
        Date.prototype.constructor = Date;

        // Upgrade Date.parse to handle simplified ISO 8601 strings
        Date.parse = function parse(string) {
            var match = isoDateExpression.exec(string);
            if (match) {
                // parse months, days, hours, minutes, seconds, and milliseconds
                // provide default values if necessary
                // parse the UTC offset component
                var year = Number(match[1]),
                    month = Number(match[2] || 1) - 1,
                    day = Number(match[3] || 1) - 1,
                    hour = Number(match[4] || 0),
                    minute = Number(match[5] || 0),
                    second = Number(match[6] || 0),
                    millisecond = Math.floor(Number(match[7] || 0) * 1000),
                    // When time zone is missed, local offset should be used
                    // (ES 5.1 bug)
                    // see https://bugs.ecmascript.org/show_bug.cgi?id=112
                    offset = !match[4] || match[8] ?
                        0 : Number(new NativeDate(1970, 0)),
                    signOffset = match[9] === "-" ? 1 : -1,
                    hourOffset = Number(match[10] || 0),
                    minuteOffset = Number(match[11] || 0),
                    result;
                if (
                    hour < (
                        minute > 0 || second > 0 || millisecond > 0 ?
                        24 : 25
                    ) &&
                    minute < 60 && second < 60 && millisecond < 1000 &&
                    month > -1 && month < 12 && hourOffset < 24 &&
                    minuteOffset < 60 && // detect invalid offsets
                    day > -1 &&
                    day < (
                        dayFromMonth(year, month + 1) -
                        dayFromMonth(year, month)
                    )
                ) {
                    result = (
                        (dayFromMonth(year, month) + day) * 24 +
                        hour +
                        hourOffset * signOffset
                    ) * 60;
                    result = (
                        (result + minute + minuteOffset * signOffset) * 60 +
                        second
                    ) * 1000 + millisecond + offset;
                    if (-8.64e15 <= result && result <= 8.64e15) {
                        return result;
                    }
                }
                return NaN;
            }
            return NativeDate.parse.apply(this, arguments);
        };

        return Date;
    })(Date);
}

// ES5 15.9.4.4
// http://es5.github.com/#x15.9.4.4
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}


//
// Number
// ======
//

// ES5.1 15.7.4.5
// http://es5.github.com/#x15.7.4.5
if (!Number.prototype.toFixed || (0.00008).toFixed(3) !== '0.000' || (0.9).toFixed(0) === '0' || (1.255).toFixed(2) !== '1.25' || (1000000000000000128).toFixed(0) !== "1000000000000000128") {
    // Hide these variables and functions
    (function () {
        var base, size, data, i;

        base = 1e7;
        size = 6;
        data = [0, 0, 0, 0, 0, 0];

        function multiply(n, c) {
            var i = -1;
            while (++i < size) {
                c += n * data[i];
                data[i] = c % base;
                c = Math.floor(c / base);
            }
        }

        function divide(n) {
            var i = size, c = 0;
            while (--i >= 0) {
                c += data[i];
                data[i] = Math.floor(c / n);
                c = (c % n) * base;
            }
        }

        function toString() {
            var i = size;
            var s = '';
            while (--i >= 0) {
                if (s !== '' || i === 0 || data[i] !== 0) {
                    var t = String(data[i]);
                    if (s === '') {
                        s = t;
                    } else {
                        s += '0000000'.slice(0, 7 - t.length) + t;
                    }
                }
            }
            return s;
        }

        function pow(x, n, acc) {
            return (n === 0 ? acc : (n % 2 === 1 ? pow(x, n - 1, acc * x) : pow(x * x, n / 2, acc)));
        }

        function log(x) {
            var n = 0;
            while (x >= 4096) {
                n += 12;
                x /= 4096;
            }
            while (x >= 2) {
                n += 1;
                x /= 2;
            }
            return n;
        }

        Number.prototype.toFixed = function (fractionDigits) {
            var f, x, s, m, e, z, j, k;

            // Test for NaN and round fractionDigits down
            f = Number(fractionDigits);
            f = f !== f ? 0 : Math.floor(f);

            if (f < 0 || f > 20) {
                throw new RangeError("Number.toFixed called with invalid number of decimals");
            }

            x = Number(this);

            // Test for NaN
            if (x !== x) {
                return "NaN";
            }

            // If it is too big or small, return the string value of the number
            if (x <= -1e21 || x >= 1e21) {
                return String(x);
            }

            s = "";

            if (x < 0) {
                s = "-";
                x = -x;
            }

            m = "0";

            if (x > 1e-21) {
                // 1e-21 < x < 1e21
                // -70 < log2(x) < 70
                e = log(x * pow(2, 69, 1)) - 69;
                z = (e < 0 ? x * pow(2, -e, 1) : x / pow(2, e, 1));
                z *= 0x10000000000000; // Math.pow(2, 52);
                e = 52 - e;

                // -18 < e < 122
                // x = z / 2 ^ e
                if (e > 0) {
                    multiply(0, z);
                    j = f;

                    while (j >= 7) {
                        multiply(1e7, 0);
                        j -= 7;
                    }

                    multiply(pow(10, j, 1), 0);
                    j = e - 1;

                    while (j >= 23) {
                        divide(1 << 23);
                        j -= 23;
                    }

                    divide(1 << j);
                    multiply(1, 1);
                    divide(2);
                    m = toString();
                } else {
                    multiply(0, z);
                    multiply(1 << (-e), 0);
                    m = toString() + '0.00000000000000000000'.slice(2, 2 + f);
                }
            }

            if (f > 0) {
                k = m.length;

                if (k <= f) {
                    m = s + '0.0000000000000000000'.slice(0, f - k + 2) + m;
                } else {
                    m = s + m.slice(0, k - f) + '.' + m.slice(k - f);
                }
            } else {
                m = s + m;
            }

            return m;
        }
    }());
}


//
// String
// ======
//


// ES5 15.5.4.14
// http://es5.github.com/#x15.5.4.14

// [bugfix, IE lt 9, firefox 4, Konqueror, Opera, obscure browsers]
// Many browsers do not split properly with regular expressions or they
// do not perform the split correctly under obscure conditions.
// See http://blog.stevenlevithan.com/archives/cross-browser-split
// I've tested in many browsers and this seems to cover the deviant ones:
//    'ab'.split(/(?:ab)*/) should be ["", ""], not [""]
//    '.'.split(/(.?)(.?)/) should be ["", ".", "", ""], not ["", ""]
//    'tesst'.split(/(s)*/) should be ["t", undefined, "e", "s", "t"], not
//       [undefined, "t", undefined, "e", ...]
//    ''.split(/.?/) should be [], not [""]
//    '.'.split(/()()/) should be ["."], not ["", "", "."]

var string_split = String.prototype.split;
if (
    'ab'.split(/(?:ab)*/).length !== 2 ||
    '.'.split(/(.?)(.?)/).length !== 4 ||
    'tesst'.split(/(s)*/)[1] === "t" ||
    ''.split(/.?/).length === 0 ||
    '.'.split(/()()/).length > 1
) {
    (function () {
        var compliantExecNpcg = /()??/.exec("")[1] === void 0; // NPCG: nonparticipating capturing group

        String.prototype.split = function (separator, limit) {
            var string = this;
            if (separator === void 0 && limit === 0)
                return [];

            // If `separator` is not a regex, use native split
            if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
                return string_split.apply(this, arguments);
            }

            var output = [],
                flags = (separator.ignoreCase ? "i" : "") +
                        (separator.multiline  ? "m" : "") +
                        (separator.extended   ? "x" : "") + // Proposed for ES6
                        (separator.sticky     ? "y" : ""), // Firefox 3+
                lastLastIndex = 0,
                // Make `global` and avoid `lastIndex` issues by working with a copy
                separator = new RegExp(separator.source, flags + "g"),
                separator2, match, lastIndex, lastLength;
            string += ""; // Type-convert
            if (!compliantExecNpcg) {
                // Doesn't need flags gy, but they don't hurt
                separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
            }
            /* Values for `limit`, per the spec:
             * If undefined: 4294967295 // Math.pow(2, 32) - 1
             * If 0, Infinity, or NaN: 0
             * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
             * If negative number: 4294967296 - Math.floor(Math.abs(limit))
             * If other: Type-convert, then use the above rules
             */
            limit = limit === void 0 ?
                -1 >>> 0 : // Math.pow(2, 32) - 1
                limit >>> 0; // ToUint32(limit)
            while (match = separator.exec(string)) {
                // `separator.lastIndex` is not reliable cross-browser
                lastIndex = match.index + match[0].length;
                if (lastIndex > lastLastIndex) {
                    output.push(string.slice(lastLastIndex, match.index));
                    // Fix browsers whose `exec` methods don't consistently return `undefined` for
                    // nonparticipating capturing groups
                    if (!compliantExecNpcg && match.length > 1) {
                        match[0].replace(separator2, function () {
                            for (var i = 1; i < arguments.length - 2; i++) {
                                if (arguments[i] === void 0) {
                                    match[i] = void 0;
                                }
                            }
                        });
                    }
                    if (match.length > 1 && match.index < string.length) {
                        Array.prototype.push.apply(output, match.slice(1));
                    }
                    lastLength = match[0].length;
                    lastLastIndex = lastIndex;
                    if (output.length >= limit) {
                        break;
                    }
                }
                if (separator.lastIndex === match.index) {
                    separator.lastIndex++; // Avoid an infinite loop
                }
            }
            if (lastLastIndex === string.length) {
                if (lastLength || !separator.test("")) {
                    output.push("");
                }
            } else {
                output.push(string.slice(lastLastIndex));
            }
            return output.length > limit ? output.slice(0, limit) : output;
        };
    }());

// [bugfix, chrome]
// If separator is undefined, then the result array contains just one String,
// which is the this value (converted to a String). If limit is not undefined,
// then the output array is truncated so that it contains no more than limit
// elements.
// "0".split(undefined, 0) -> []
} else if ("0".split(void 0, 0).length) {
    String.prototype.split = function(separator, limit) {
        if (separator === void 0 && limit === 0) return [];
        return string_split.apply(this, arguments);
    }
}


// ECMA-262, 3rd B.2.3
// Note an ECMAScript standart, although ECMAScript 3rd Edition has a
// non-normative section suggesting uniform semantics and it should be
// normalized across all browsers
// [bugfix, IE lt 9] IE < 9 substr() with negative value not working in IE
if("".substr && "0b".substr(-1) !== "b") {
    var string_substr = String.prototype.substr;
    /**
     *  Get the substring of a string
     *  @param  {integer}  start   where to start the substring
     *  @param  {integer}  length  how many characters to return
     *  @return {string}
     */
    String.prototype.substr = function(start, length) {
        return string_substr.call(
            this,
            start < 0 ? ((start = this.length + start) < 0 ? 0 : start) : start,
            length
        );
    }
}

// ES5 15.5.4.20
// http://es5.github.com/#x15.5.4.20
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    // http://blog.stevenlevithan.com/archives/faster-trim-javascript
    // http://perfectionkills.com/whitespace-deviations/
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        if (this === void 0 || this === null) {
            throw new TypeError("can't convert "+this+" to object");
        }
        return String(this)
            .replace(trimBeginRegexp, "")
            .replace(trimEndRegexp, "");
    };
}

//
// Util
// ======
//

// ES5 9.4
// http://es5.github.com/#x9.4
// http://jsperf.com/to-integer

function toInteger(n) {
    n = +n;
    if (n !== n) { // isNaN
        n = 0;
    } else if (n !== 0 && n !== (1/0) && n !== -(1/0)) {
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
    return n;
}

function isPrimitive(input) {
    var type = typeof input;
    return (
        input === null ||
        type === "undefined" ||
        type === "boolean" ||
        type === "number" ||
        type === "string"
    );
}

function toPrimitive(input) {
    var val, valueOf, toString;
    if (isPrimitive(input)) {
        return input;
    }
    valueOf = input.valueOf;
    if (typeof valueOf === "function") {
        val = valueOf.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    toString = input.toString;
    if (typeof toString === "function") {
        val = toString.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    throw new TypeError();
}

// ES5 9.9
// http://es5.github.com/#x9.9
var toObject = function (o) {
    if (o == null) { // this matches both null and undefined
        throw new TypeError("can't convert "+o+" to object");
    }
    return Object(o);
};

});

/*!
 * jQuery JavaScript Library v1.8.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: Tue Nov 13 2012 08:20:33 GMT-0500 (Eastern Standard Time)
 */
(function( window, undefined ) {
var
        // A central reference to the root jQuery(document)
        rootjQuery,

        // The deferred used on DOM ready
        readyList,

        // Use the correct document accordingly with window argument (sandbox)
        document = window.document,
        location = window.location,
        navigator = window.navigator,

        // Map over jQuery in case of overwrite
        _jQuery = window.jQuery,

        // Map over the $ in case of overwrite
        _$ = window.$,

        // Save a reference to some core methods
        core_push = Array.prototype.push,
        core_slice = Array.prototype.slice,
        core_indexOf = Array.prototype.indexOf,
        core_toString = Object.prototype.toString,
        core_hasOwn = Object.prototype.hasOwnProperty,
        core_trim = String.prototype.trim,

        // Define a local copy of jQuery
        jQuery = function( selector, context ) {
                // The jQuery object is actually just the init constructor 'enhanced'
                return new jQuery.fn.init( selector, context, rootjQuery );
        },

        // Used for matching numbers
        core_pnum = /[\-+]?(?:\d*\.|)\d+(?:[eE][\-+]?\d+|)/.source,

        // Used for detecting and trimming whitespace
        core_rnotwhite = /\S/,
        core_rspace = /\s+/,

        // Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
        rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

        // A simple way to check for HTML strings
        // Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
        rquickExpr = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

        // Match a standalone tag
        rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

        // JSON RegExp
        rvalidchars = /^[\],:{}\s]*$/,
        rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,
        rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
        rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d\d*\.|)\d+(?:[eE][\-+]?\d+|)/g,

        // Matches dashed string for camelizing
        rmsPrefix = /^-ms-/,
        rdashAlpha = /-([\da-z])/gi,

        // Used by jQuery.camelCase as callback to replace()
        fcamelCase = function( all, letter ) {
                return ( letter + "" ).toUpperCase();
        },

        // The ready event handler and self cleanup method
        DOMContentLoaded = function() {
                if ( document.addEventListener ) {
                        document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
                        jQuery.ready();
                } else if ( document.readyState === "complete" ) {
                        // we're here because readyState === "complete" in oldIE
                        // which is good enough for us to call the dom ready!
                        document.detachEvent( "onreadystatechange", DOMContentLoaded );
                        jQuery.ready();
                }
        },

        // [[Class]] -> type pairs
        class2type = {};

jQuery.fn = jQuery.prototype = {
        constructor: jQuery,
        init: function( selector, context, rootjQuery ) {
                var match, elem, ret, doc;

                // Handle $(""), $(null), $(undefined), $(false)
                if ( !selector ) {
                        return this;
                }

                // Handle $(DOMElement)
                if ( selector.nodeType ) {
                        this.context = this[0] = selector;
                        this.length = 1;
                        return this;
                }

                // Handle HTML strings
                if ( typeof selector === "string" ) {
                        if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
                                // Assume that strings that start and end with <> are HTML and skip the regex check
                                match = [ null, selector, null ];

                        } else {
                                match = rquickExpr.exec( selector );
                        }

                        // Match html or make sure no context is specified for #id
                        if ( match && (match[1] || !context) ) {

                                // HANDLE: $(html) -> $(array)
                                if ( match[1] ) {
                                        context = context instanceof jQuery ? context[0] : context;
                                        doc = ( context && context.nodeType ? context.ownerDocument || context : document );

                                        // scripts is true for back-compat
                                        selector = jQuery.parseHTML( match[1], doc, true );
                                        if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
                                                this.attr.call( selector, context, true );
                                        }

                                        return jQuery.merge( this, selector );

                                // HANDLE: $(#id)
                                } else {
                                        elem = document.getElementById( match[2] );

                                        // Check parentNode to catch when Blackberry 4.6 returns
                                        // nodes that are no longer in the document #6963
                                        if ( elem && elem.parentNode ) {
                                                // Handle the case where IE and Opera return items
                                                // by name instead of ID
                                                if ( elem.id !== match[2] ) {
                                                        return rootjQuery.find( selector );
                                                }

                                                // Otherwise, we inject the element directly into the jQuery object
                                                this.length = 1;
                                                this[0] = elem;
                                        }

                                        this.context = document;
                                        this.selector = selector;
                                        return this;
                                }

                        // HANDLE: $(expr, $(...))
                        } else if ( !context || context.jquery ) {
                                return ( context || rootjQuery ).find( selector );

                        // HANDLE: $(expr, context)
                        // (which is just equivalent to: $(context).find(expr)
                        } else {
                                return this.constructor( context ).find( selector );
                        }

                // HANDLE: $(function)
                // Shortcut for document ready
                } else if ( jQuery.isFunction( selector ) ) {
                        return rootjQuery.ready( selector );
                }

                if ( selector.selector !== undefined ) {
                        this.selector = selector.selector;
                        this.context = selector.context;
                }

                return jQuery.makeArray( selector, this );
        },

        // Start with an empty selector
        selector: "",

        // The current version of jQuery being used
        jquery: "1.8.3",

        // The default length of a jQuery object is 0
        length: 0,

        // The number of elements contained in the matched element set
        size: function() {
                return this.length;
        },

        toArray: function() {
                return core_slice.call( this );
        },

        // Get the Nth element in the matched element set OR
        // Get the whole matched element set as a clean array
        get: function( num ) {
                return num == null ?

                        // Return a 'clean' array
                        this.toArray() :

                        // Return just the object
                        ( num < 0 ? this[ this.length + num ] : this[ num ] );
        },

        // Take an array of elements and push it onto the stack
        // (returning the new matched element set)
        pushStack: function( elems, name, selector ) {

                // Build a new jQuery matched element set
                var ret = jQuery.merge( this.constructor(), elems );

                // Add the old object onto the stack (as a reference)
                ret.prevObject = this;

                ret.context = this.context;

                if ( name === "find" ) {
                        ret.selector = this.selector + ( this.selector ? " " : "" ) + selector;
                } else if ( name ) {
                        ret.selector = this.selector + "." + name + "(" + selector + ")";
                }

                // Return the newly-formed element set
                return ret;
        },

        // Execute a callback for every element in the matched set.
        // (You can seed the arguments with an array of args, but this is
        // only used internally.)
        each: function( callback, args ) {
                return jQuery.each( this, callback, args );
        },

        ready: function( fn ) {
                // Add the callback
                jQuery.ready.promise().done( fn );

                return this;
        },

        eq: function( i ) {
                i = +i;
                return i === -1 ?
                        this.slice( i ) :
                        this.slice( i, i + 1 );
        },

        first: function() {
                return this.eq( 0 );
        },

        last: function() {
                return this.eq( -1 );
        },

        slice: function() {
                return this.pushStack( core_slice.apply( this, arguments ),
                        "slice", core_slice.call(arguments).join(",") );
        },

        map: function( callback ) {
                return this.pushStack( jQuery.map(this, function( elem, i ) {
                        return callback.call( elem, i, elem );
                }));
        },

        end: function() {
                return this.prevObject || this.constructor(null);
        },

        // For internal use only.
        // Behaves like an Array's method, not like a jQuery method.
        push: core_push,
        sort: [].sort,
        splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
        var options, name, src, copy, copyIsArray, clone,
                target = arguments[0] || {},
                i = 1,
                length = arguments.length,
                deep = false;

        // Handle a deep copy situation
        if ( typeof target === "boolean" ) {
                deep = target;
                target = arguments[1] || {};
                // skip the boolean and the target
                i = 2;
        }

        // Handle case when target is a string or something (possible in deep copy)
        if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
                target = {};
        }

        // extend jQuery itself if only one argument is passed
        if ( length === i ) {
                target = this;
                --i;
        }

        for ( ; i < length; i++ ) {
                // Only deal with non-null/undefined values
                if ( (options = arguments[ i ]) != null ) {
                        // Extend the base object
                        for ( name in options ) {
                                src = target[ name ];
                                copy = options[ name ];

                                // Prevent never-ending loop
                                if ( target === copy ) {
                                        continue;
                                }

                                // Recurse if we're merging plain objects or arrays
                                if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
                                        if ( copyIsArray ) {
                                                copyIsArray = false;
                                                clone = src && jQuery.isArray(src) ? src : [];

                                        } else {
                                                clone = src && jQuery.isPlainObject(src) ? src : {};
                                        }

                                        // Never move original objects, clone them
                                        target[ name ] = jQuery.extend( deep, clone, copy );

                                // Don't bring in undefined values
                                } else if ( copy !== undefined ) {
                                        target[ name ] = copy;
                                }
                        }
                }
        }

        // Return the modified object
        return target;
};

jQuery.extend({
        noConflict: function( deep ) {
                if ( window.$ === jQuery ) {
                        window.$ = _$;
                }

                if ( deep && window.jQuery === jQuery ) {
                        window.jQuery = _jQuery;
                }

                return jQuery;
        },

        // Is the DOM ready to be used? Set to true once it occurs.
        isReady: false,

        // A counter to track how many items to wait for before
        // the ready event fires. See #6781
        readyWait: 1,

        // Hold (or release) the ready event
        holdReady: function( hold ) {
                if ( hold ) {
                        jQuery.readyWait++;
                } else {
                        jQuery.ready( true );
                }
        },

        // Handle when the DOM is ready
        ready: function( wait ) {

                // Abort if there are pending holds or we're already ready
                if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
                        return;
                }

                // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
                if ( !document.body ) {
                        return setTimeout( jQuery.ready, 1 );
                }

                // Remember that the DOM is ready
                jQuery.isReady = true;

                // If a normal DOM Ready event fired, decrement, and wait if need be
                if ( wait !== true && --jQuery.readyWait > 0 ) {
                        return;
                }

                // If there are functions bound, to execute
                readyList.resolveWith( document, [ jQuery ] );

                // Trigger any bound ready events
                if ( jQuery.fn.trigger ) {
                        jQuery( document ).trigger("ready").off("ready");
                }
        },

        // See test/unit/core.js for details concerning isFunction.
        // Since version 1.3, DOM methods and functions like alert
        // aren't supported. They return false on IE (#2968).
        isFunction: function( obj ) {
                return jQuery.type(obj) === "function";
        },

        isArray: Array.isArray || function( obj ) {
                return jQuery.type(obj) === "array";
        },

        isWindow: function( obj ) {
                return obj != null && obj == obj.window;
        },

        isNumeric: function( obj ) {
                return !isNaN( parseFloat(obj) ) && isFinite( obj );
        },

        type: function( obj ) {
                return obj == null ?
                        String( obj ) :
                        class2type[ core_toString.call(obj) ] || "object";
        },

        isPlainObject: function( obj ) {
                // Must be an Object.
                // Because of IE, we also have to check the presence of the constructor property.
                // Make sure that DOM nodes and window objects don't pass through, as well
                if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
                        return false;
                }

                try {
                        // Not own constructor property must be Object
                        if ( obj.constructor &&
                                !core_hasOwn.call(obj, "constructor") &&
                                !core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
                                return false;
                        }
                } catch ( e ) {
                        // IE8,9 Will throw exceptions on certain host objects #9897
                        return false;
                }

                // Own properties are enumerated firstly, so to speed up,
                // if last one is own, then all properties are own.

                var key;
                for ( key in obj ) {}

                return key === undefined || core_hasOwn.call( obj, key );
        },

        isEmptyObject: function( obj ) {
                var name;
                for ( name in obj ) {
                        return false;
                }
                return true;
        },

        error: function( msg ) {
                throw new Error( msg );
        },

        // data: string of html
        // context (optional): If specified, the fragment will be created in this context, defaults to document
        // scripts (optional): If true, will include scripts passed in the html string
        parseHTML: function( data, context, scripts ) {
                var parsed;
                if ( !data || typeof data !== "string" ) {
                        return null;
                }
                if ( typeof context === "boolean" ) {
                        scripts = context;
                        context = 0;
                }
                context = context || document;

                // Single tag
                if ( (parsed = rsingleTag.exec( data )) ) {
                        return [ context.createElement( parsed[1] ) ];
                }

                parsed = jQuery.buildFragment( [ data ], context, scripts ? null : [] );
                return jQuery.merge( [],
                        (parsed.cacheable ? jQuery.clone( parsed.fragment ) : parsed.fragment).childNodes );
        },

        parseJSON: function( data ) {
                if ( !data || typeof data !== "string") {
                        return null;
                }

                // Make sure leading/trailing whitespace is removed (IE can't handle it)
                data = jQuery.trim( data );

                // Attempt to parse using the native JSON parser first
                if ( window.JSON && window.JSON.parse ) {
                        return window.JSON.parse( data );
                }

                // Make sure the incoming data is actual JSON
                // Logic borrowed from http://json.org/json2.js
                if ( rvalidchars.test( data.replace( rvalidescape, "@" )
                        .replace( rvalidtokens, "]" )
                        .replace( rvalidbraces, "")) ) {

                        return ( new Function( "return " + data ) )();

                }
                jQuery.error( "Invalid JSON: " + data );
        },

        // Cross-browser xml parsing
        parseXML: function( data ) {
                var xml, tmp;
                if ( !data || typeof data !== "string" ) {
                        return null;
                }
                try {
                        if ( window.DOMParser ) { // Standard
                                tmp = new DOMParser();
                                xml = tmp.parseFromString( data , "text/xml" );
                        } else { // IE
                                xml = new ActiveXObject( "Microsoft.XMLDOM" );
                                xml.async = "false";
                                xml.loadXML( data );
                        }
                } catch( e ) {
                        xml = undefined;
                }
                if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
                        jQuery.error( "Invalid XML: " + data );
                }
                return xml;
        },

        noop: function() {},

        // Evaluates a script in a global context
        // Workarounds based on findings by Jim Driscoll
        // http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
        globalEval: function( data ) {
                if ( data && core_rnotwhite.test( data ) ) {
                        // We use execScript on Internet Explorer
                        // We use an anonymous function so that context is window
                        // rather than jQuery in Firefox
                        ( window.execScript || function( data ) {
                                window[ "eval" ].call( window, data );
                        } )( data );
                }
        },

        // Convert dashed to camelCase; used by the css and data modules
        // Microsoft forgot to hump their vendor prefix (#9572)
        camelCase: function( string ) {
                return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
        },

        nodeName: function( elem, name ) {
                return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
        },

        // args is for internal usage only
        each: function( obj, callback, args ) {
                var name,
                        i = 0,
                        length = obj.length,
                        isObj = length === undefined || jQuery.isFunction( obj );

                if ( args ) {
                        if ( isObj ) {
                                for ( name in obj ) {
                                        if ( callback.apply( obj[ name ], args ) === false ) {
                                                break;
                                        }
                                }
                        } else {
                                for ( ; i < length; ) {
                                        if ( callback.apply( obj[ i++ ], args ) === false ) {
                                                break;
                                        }
                                }
                        }

                // A special, fast, case for the most common use of each
                } else {
                        if ( isObj ) {
                                for ( name in obj ) {
                                        if ( callback.call( obj[ name ], name, obj[ name ] ) === false ) {
                                                break;
                                        }
                                }
                        } else {
                                for ( ; i < length; ) {
                                        if ( callback.call( obj[ i ], i, obj[ i++ ] ) === false ) {
                                                break;
                                        }
                                }
                        }
                }

                return obj;
        },

        // Use native String.trim function wherever possible
        trim: core_trim && !core_trim.call("\uFEFF\xA0") ?
                function( text ) {
                        return text == null ?
                                "" :
                                core_trim.call( text );
                } :

                // Otherwise use our own trimming functionality
                function( text ) {
                        return text == null ?
                                "" :
                                ( text + "" ).replace( rtrim, "" );
                },

        // results is for internal usage only
        makeArray: function( arr, results ) {
                var type,
                        ret = results || [];

                if ( arr != null ) {
                        // The window, strings (and functions) also have 'length'
                        // Tweaked logic slightly to handle Blackberry 4.7 RegExp issues #6930
                        type = jQuery.type( arr );

                        if ( arr.length == null || type === "string" || type === "function" || type === "regexp" || jQuery.isWindow( arr ) ) {
                                core_push.call( ret, arr );
                        } else {
                                jQuery.merge( ret, arr );
                        }
                }

                return ret;
        },

        inArray: function( elem, arr, i ) {
                var len;

                if ( arr ) {
                        if ( core_indexOf ) {
                                return core_indexOf.call( arr, elem, i );
                        }

                        len = arr.length;
                        i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

                        for ( ; i < len; i++ ) {
                                // Skip accessing in sparse arrays
                                if ( i in arr && arr[ i ] === elem ) {
                                        return i;
                                }
                        }
                }

                return -1;
        },

        merge: function( first, second ) {
                var l = second.length,
                        i = first.length,
                        j = 0;

                if ( typeof l === "number" ) {
                        for ( ; j < l; j++ ) {
                                first[ i++ ] = second[ j ];
                        }

                } else {
                        while ( second[j] !== undefined ) {
                                first[ i++ ] = second[ j++ ];
                        }
                }

                first.length = i;

                return first;
        },

        grep: function( elems, callback, inv ) {
                var retVal,
                        ret = [],
                        i = 0,
                        length = elems.length;
                inv = !!inv;

                // Go through the array, only saving the items
                // that pass the validator function
                for ( ; i < length; i++ ) {
                        retVal = !!callback( elems[ i ], i );
                        if ( inv !== retVal ) {
                                ret.push( elems[ i ] );
                        }
                }

                return ret;
        },

        // arg is for internal usage only
        map: function( elems, callback, arg ) {
                var value, key,
                        ret = [],
                        i = 0,
                        length = elems.length,
                        // jquery objects are treated as arrays
                        isArray = elems instanceof jQuery || length !== undefined && typeof length === "number" && ( ( length > 0 && elems[ 0 ] && elems[ length -1 ] ) || length === 0 || jQuery.isArray( elems ) ) ;

                // Go through the array, translating each of the items to their
                if ( isArray ) {
                        for ( ; i < length; i++ ) {
                                value = callback( elems[ i ], i, arg );

                                if ( value != null ) {
                                        ret[ ret.length ] = value;
                                }
                        }

                // Go through every key on the object,
                } else {
                        for ( key in elems ) {
                                value = callback( elems[ key ], key, arg );

                                if ( value != null ) {
                                        ret[ ret.length ] = value;
                                }
                        }
                }

                // Flatten any nested arrays
                return ret.concat.apply( [], ret );
        },

        // A global GUID counter for objects
        guid: 1,

        // Bind a function to a context, optionally partially applying any
        // arguments.
        proxy: function( fn, context ) {
                var tmp, args, proxy;

                if ( typeof context === "string" ) {
                        tmp = fn[ context ];
                        context = fn;
                        fn = tmp;
                }

                // Quick check to determine if target is callable, in the spec
                // this throws a TypeError, but we will just return undefined.
                if ( !jQuery.isFunction( fn ) ) {
                        return undefined;
                }

                // Simulated bind
                args = core_slice.call( arguments, 2 );
                proxy = function() {
                        return fn.apply( context, args.concat( core_slice.call( arguments ) ) );
                };

                // Set the guid of unique handler to the same of original handler, so it can be removed
                proxy.guid = fn.guid = fn.guid || jQuery.guid++;

                return proxy;
        },

        // Multifunctional method to get and set values of a collection
        // The value/s can optionally be executed if it's a function
        access: function( elems, fn, key, value, chainable, emptyGet, pass ) {
                var exec,
                        bulk = key == null,
                        i = 0,
                        length = elems.length;

                // Sets many values
                if ( key && typeof key === "object" ) {
                        for ( i in key ) {
                                jQuery.access( elems, fn, i, key[i], 1, emptyGet, value );
                        }
                        chainable = 1;

                // Sets one value
                } else if ( value !== undefined ) {
                        // Optionally, function values get executed if exec is true
                        exec = pass === undefined && jQuery.isFunction( value );

                        if ( bulk ) {
                                // Bulk operations only iterate when executing function values
                                if ( exec ) {
                                        exec = fn;
                                        fn = function( elem, key, value ) {
                                                return exec.call( jQuery( elem ), value );
                                        };

                                // Otherwise they run against the entire set
                                } else {
                                        fn.call( elems, value );
                                        fn = null;
                                }
                        }

                        if ( fn ) {
                                for (; i < length; i++ ) {
                                        fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
                                }
                        }

                        chainable = 1;
                }

                return chainable ?
                        elems :

                        // Gets
                        bulk ?
                                fn.call( elems ) :
                                length ? fn( elems[0], key ) : emptyGet;
        },

        now: function() {
                return ( new Date() ).getTime();
        }
});

jQuery.ready.promise = function( obj ) {
        if ( !readyList ) {

                readyList = jQuery.Deferred();

                // Catch cases where $(document).ready() is called after the browser event has already occurred.
                // we once tried to use readyState "interactive" here, but it caused issues like the one
                // discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
                if ( document.readyState === "complete" ) {
                        // Handle it asynchronously to allow scripts the opportunity to delay ready
                        setTimeout( jQuery.ready, 1 );

                // Standards-based browsers support DOMContentLoaded
                } else if ( document.addEventListener ) {
                        // Use the handy event callback
                        document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );

                        // A fallback to window.onload, that will always work
                        window.addEventListener( "load", jQuery.ready, false );

                // If IE event model is used
                } else {
                        // Ensure firing before onload, maybe late but safe also for iframes
                        document.attachEvent( "onreadystatechange", DOMContentLoaded );

                        // A fallback to window.onload, that will always work
                        window.attachEvent( "onload", jQuery.ready );

                        // If IE and not a frame
                        // continually check to see if the document is ready
                        var top = false;

                        try {
                                top = window.frameElement == null && document.documentElement;
                        } catch(e) {}

                        if ( top && top.doScroll ) {
                                (function doScrollCheck() {
                                        if ( !jQuery.isReady ) {

                                                try {
                                                        // Use the trick by Diego Perini
                                                        // http://javascript.nwbox.com/IEContentLoaded/
                                                        top.doScroll("left");
                                                } catch(e) {
                                                        return setTimeout( doScrollCheck, 50 );
                                                }

                                                // and execute any waiting functions
                                                jQuery.ready();
                                        }
                                })();
                        }
                }
        }
        return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(i, name) {
        class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
        var object = optionsCache[ options ] = {};
        jQuery.each( options.split( core_rspace ), function( _, flag ) {
                object[ flag ] = true;
        });
        return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *      options: an optional list of space-separated options that will change how
 *                      the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *      once:                   will ensure the callback list can only be fired once (like a Deferred)
 *
 *      memory:                 will keep track of previous values and will call any callback added
 *                                      after the list has been fired right away with the latest "memorized"
 *                                      values (like a Deferred)
 *
 *      unique:                 will ensure a callback can only be added once (no duplicate in the list)
 *
 *      stopOnFalse:    interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

        // Convert options from String-formatted to Object-formatted if needed
        // (we check in cache first)
        options = typeof options === "string" ?
                ( optionsCache[ options ] || createOptions( options ) ) :
                jQuery.extend( {}, options );

        var // Last fire value (for non-forgettable lists)
                memory,
                // Flag to know if list was already fired
                fired,
                // Flag to know if list is currently firing
                firing,
                // First callback to fire (used internally by add and fireWith)
                firingStart,
                // End of the loop when firing
                firingLength,
                // Index of currently firing callback (modified by remove if needed)
                firingIndex,
                // Actual callback list
                list = [],
                // Stack of fire calls for repeatable lists
                stack = !options.once && [],
                // Fire callbacks
                fire = function( data ) {
                        memory = options.memory && data;
                        fired = true;
                        firingIndex = firingStart || 0;
                        firingStart = 0;
                        firingLength = list.length;
                        firing = true;
                        for ( ; list && firingIndex < firingLength; firingIndex++ ) {
                                if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
                                        memory = false; // To prevent further calls using add
                                        break;
                                }
                        }
                        firing = false;
                        if ( list ) {
                                if ( stack ) {
                                        if ( stack.length ) {
                                                fire( stack.shift() );
                                        }
                                } else if ( memory ) {
                                        list = [];
                                } else {
                                        self.disable();
                                }
                        }
                },
                // Actual Callbacks object
                self = {
                        // Add a callback or a collection of callbacks to the list
                        add: function() {
                                if ( list ) {
                                        // First, we save the current length
                                        var start = list.length;
                                        (function add( args ) {
                                                jQuery.each( args, function( _, arg ) {
                                                        var type = jQuery.type( arg );
                                                        if ( type === "function" ) {
                                                                if ( !options.unique || !self.has( arg ) ) {
                                                                        list.push( arg );
                                                                }
                                                        } else if ( arg && arg.length && type !== "string" ) {
                                                                // Inspect recursively
                                                                add( arg );
                                                        }
                                                });
                                        })( arguments );
                                        // Do we need to add the callbacks to the
                                        // current firing batch?
                                        if ( firing ) {
                                                firingLength = list.length;
                                        // With memory, if we're not firing then
                                        // we should call right away
                                        } else if ( memory ) {
                                                firingStart = start;
                                                fire( memory );
                                        }
                                }
                                return this;
                        },
                        // Remove a callback from the list
                        remove: function() {
                                if ( list ) {
                                        jQuery.each( arguments, function( _, arg ) {
                                                var index;
                                                while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
                                                        list.splice( index, 1 );
                                                        // Handle firing indexes
                                                        if ( firing ) {
                                                                if ( index <= firingLength ) {
                                                                        firingLength--;
                                                                }
                                                                if ( index <= firingIndex ) {
                                                                        firingIndex--;
                                                                }
                                                        }
                                                }
                                        });
                                }
                                return this;
                        },
                        // Control if a given callback is in the list
                        has: function( fn ) {
                                return jQuery.inArray( fn, list ) > -1;
                        },
                        // Remove all callbacks from the list
                        empty: function() {
                                list = [];
                                return this;
                        },
                        // Have the list do nothing anymore
                        disable: function() {
                                list = stack = memory = undefined;
                                return this;
                        },
                        // Is it disabled?
                        disabled: function() {
                                return !list;
                        },
                        // Lock the list in its current state
                        lock: function() {
                                stack = undefined;
                                if ( !memory ) {
                                        self.disable();
                                }
                                return this;
                        },
                        // Is it locked?
                        locked: function() {
                                return !stack;
                        },
                        // Call all callbacks with the given context and arguments
                        fireWith: function( context, args ) {
                                args = args || [];
                                args = [ context, args.slice ? args.slice() : args ];
                                if ( list && ( !fired || stack ) ) {
                                        if ( firing ) {
                                                stack.push( args );
                                        } else {
                                                fire( args );
                                        }
                                }
                                return this;
                        },
                        // Call all the callbacks with the given arguments
                        fire: function() {
                                self.fireWith( this, arguments );
                                return this;
                        },
                        // To know if the callbacks have already been called at least once
                        fired: function() {
                                return !!fired;
                        }
                };

        return self;
};
jQuery.extend({

        Deferred: function( func ) {
                var tuples = [
                                // action, add listener, listener list, final state
                                [ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
                                [ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
                                [ "notify", "progress", jQuery.Callbacks("memory") ]
                        ],
                        state = "pending",
                        promise = {
                                state: function() {
                                        return state;
                                },
                                always: function() {
                                        deferred.done( arguments ).fail( arguments );
                                        return this;
                                },
                                then: function( /* fnDone, fnFail, fnProgress */ ) {
                                        var fns = arguments;
                                        return jQuery.Deferred(function( newDefer ) {
                                                jQuery.each( tuples, function( i, tuple ) {
                                                        var action = tuple[ 0 ],
                                                                fn = fns[ i ];
                                                        // deferred[ done | fail | progress ] for forwarding actions to newDefer
                                                        deferred[ tuple[1] ]( jQuery.isFunction( fn ) ?
                                                                function() {
                                                                        var returned = fn.apply( this, arguments );
                                                                        if ( returned && jQuery.isFunction( returned.promise ) ) {
                                                                                returned.promise()
                                                                                        .done( newDefer.resolve )
                                                                                        .fail( newDefer.reject )
                                                                                        .progress( newDefer.notify );
                                                                        } else {
                                                                                newDefer[ action + "With" ]( this === deferred ? newDefer : this, [ returned ] );
                                                                        }
                                                                } :
                                                                newDefer[ action ]
                                                        );
                                                });
                                                fns = null;
                                        }).promise();
                                },
                                // Get a promise for this deferred
                                // If obj is provided, the promise aspect is added to the object
                                promise: function( obj ) {
                                        return obj != null ? jQuery.extend( obj, promise ) : promise;
                                }
                        },
                        deferred = {};

                // Keep pipe for back-compat
                promise.pipe = promise.then;

                // Add list-specific methods
                jQuery.each( tuples, function( i, tuple ) {
                        var list = tuple[ 2 ],
                                stateString = tuple[ 3 ];

                        // promise[ done | fail | progress ] = list.add
                        promise[ tuple[1] ] = list.add;

                        // Handle state
                        if ( stateString ) {
                                list.add(function() {
                                        // state = [ resolved | rejected ]
                                        state = stateString;

                                // [ reject_list | resolve_list ].disable; progress_list.lock
                                }, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
                        }

                        // deferred[ resolve | reject | notify ] = list.fire
                        deferred[ tuple[0] ] = list.fire;
                        deferred[ tuple[0] + "With" ] = list.fireWith;
                });

                // Make the deferred a promise
                promise.promise( deferred );

                // Call given func if any
                if ( func ) {
                        func.call( deferred, deferred );
                }

                // All done!
                return deferred;
        },

        // Deferred helper
        when: function( subordinate /* , ..., subordinateN */ ) {
                var i = 0,
                        resolveValues = core_slice.call( arguments ),
                        length = resolveValues.length,

                        // the count of uncompleted subordinates
                        remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

                        // the master Deferred. If resolveValues consist of only a single Deferred, just use that.
                        deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

                        // Update function for both resolve and progress values
                        updateFunc = function( i, contexts, values ) {
                                return function( value ) {
                                        contexts[ i ] = this;
                                        values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
                                        if( values === progressValues ) {
                                                deferred.notifyWith( contexts, values );
                                        } else if ( !( --remaining ) ) {
                                                deferred.resolveWith( contexts, values );
                                        }
                                };
                        },

                        progressValues, progressContexts, resolveContexts;

                // add listeners to Deferred subordinates; treat others as resolved
                if ( length > 1 ) {
                        progressValues = new Array( length );
                        progressContexts = new Array( length );
                        resolveContexts = new Array( length );
                        for ( ; i < length; i++ ) {
                                if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
                                        resolveValues[ i ].promise()
                                                .done( updateFunc( i, resolveContexts, resolveValues ) )
                                                .fail( deferred.reject )
                                                .progress( updateFunc( i, progressContexts, progressValues ) );
                                } else {
                                        --remaining;
                                }
                        }
                }

                // if we're not waiting on anything, resolve the master
                if ( !remaining ) {
                        deferred.resolveWith( resolveContexts, resolveValues );
                }

                return deferred.promise();
        }
});
jQuery.support = (function() {

        var support,
                all,
                a,
                select,
                opt,
                input,
                fragment,
                eventName,
                i,
                isSupported,
                clickFn,
                div = document.createElement("div");

        // Setup
        div.setAttribute( "className", "t" );
        div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

        // Support tests won't run in some limited or non-browser environments
        all = div.getElementsByTagName("*");
        a = div.getElementsByTagName("a")[ 0 ];
        if ( !all || !a || !all.length ) {
                return {};
        }

        // First batch of tests
        select = document.createElement("select");
        opt = select.appendChild( document.createElement("option") );
        input = div.getElementsByTagName("input")[ 0 ];

        a.style.cssText = "top:1px;float:left;opacity:.5";
        support = {
                // IE strips leading whitespace when .innerHTML is used
                leadingWhitespace: ( div.firstChild.nodeType === 3 ),

                // Make sure that tbody elements aren't automatically inserted
                // IE will insert them into empty tables
                tbody: !div.getElementsByTagName("tbody").length,

                // Make sure that link elements get serialized correctly by innerHTML
                // This requires a wrapper element in IE
                htmlSerialize: !!div.getElementsByTagName("link").length,

                // Get the style information from getAttribute
                // (IE uses .cssText instead)
                style: /top/.test( a.getAttribute("style") ),

                // Make sure that URLs aren't manipulated
                // (IE normalizes it by default)
                hrefNormalized: ( a.getAttribute("href") === "/a" ),

                // Make sure that element opacity exists
                // (IE uses filter instead)
                // Use a regex to work around a WebKit issue. See #5145
                opacity: /^0.5/.test( a.style.opacity ),

                // Verify style float existence
                // (IE uses styleFloat instead of cssFloat)
                cssFloat: !!a.style.cssFloat,

                // Make sure that if no value is specified for a checkbox
                // that it defaults to "on".
                // (WebKit defaults to "" instead)
                checkOn: ( input.value === "on" ),

                // Make sure that a selected-by-default option has a working selected property.
                // (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
                optSelected: opt.selected,

                // Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
                getSetAttribute: div.className !== "t",

                // Tests for enctype support on a form (#6743)
                enctype: !!document.createElement("form").enctype,

                // Makes sure cloning an html5 element does not cause problems
                // Where outerHTML is undefined, this still works
                html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

                // jQuery.support.boxModel DEPRECATED in 1.8 since we don't support Quirks Mode
                boxModel: ( document.compatMode === "CSS1Compat" ),

                // Will be defined later
                submitBubbles: true,
                changeBubbles: true,
                focusinBubbles: false,
                deleteExpando: true,
                noCloneEvent: true,
                inlineBlockNeedsLayout: false,
                shrinkWrapBlocks: false,
                reliableMarginRight: true,
                boxSizingReliable: true,
                pixelPosition: false
        };

        // Make sure checked status is properly cloned
        input.checked = true;
        support.noCloneChecked = input.cloneNode( true ).checked;

        // Make sure that the options inside disabled selects aren't marked as disabled
        // (WebKit marks them as disabled)
        select.disabled = true;
        support.optDisabled = !opt.disabled;

        // Test to see if it's possible to delete an expando from an element
        // Fails in Internet Explorer
        try {
                delete div.test;
        } catch( e ) {
                support.deleteExpando = false;
        }

        if ( !div.addEventListener && div.attachEvent && div.fireEvent ) {
                div.attachEvent( "onclick", clickFn = function() {
                        // Cloning a node shouldn't copy over any
                        // bound event handlers (IE does this)
                        support.noCloneEvent = false;
                });
                div.cloneNode( true ).fireEvent("onclick");
                div.detachEvent( "onclick", clickFn );
        }

        // Check if a radio maintains its value
        // after being appended to the DOM
        input = document.createElement("input");
        input.value = "t";
        input.setAttribute( "type", "radio" );
        support.radioValue = input.value === "t";

        input.setAttribute( "checked", "checked" );

        // #11217 - WebKit loses check when the name is after the checked attribute
        input.setAttribute( "name", "t" );

        div.appendChild( input );
        fragment = document.createDocumentFragment();
        fragment.appendChild( div.lastChild );

        // WebKit doesn't clone checked state correctly in fragments
        support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

        // Check if a disconnected checkbox will retain its checked
        // value of true after appended to the DOM (IE6/7)
        support.appendChecked = input.checked;

        fragment.removeChild( input );
        fragment.appendChild( div );

        // Technique from Juriy Zaytsev
        // http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
        // We only care about the case where non-standard event systems
        // are used, namely in IE. Short-circuiting here helps us to
        // avoid an eval call (in setAttribute) which can cause CSP
        // to go haywire. See: https://developer.mozilla.org/en/Security/CSP
        if ( div.attachEvent ) {
                for ( i in {
                        submit: true,
                        change: true,
                        focusin: true
                }) {
                        eventName = "on" + i;
                        isSupported = ( eventName in div );
                        if ( !isSupported ) {
                                div.setAttribute( eventName, "return;" );
                                isSupported = ( typeof div[ eventName ] === "function" );
                        }
                        support[ i + "Bubbles" ] = isSupported;
                }
        }

        // Run tests that need a body at doc ready
        jQuery(function() {
                var container, div, tds, marginDiv,
                        divReset = "padding:0;margin:0;border:0;display:block;overflow:hidden;",
                        body = document.getElementsByTagName("body")[0];

                if ( !body ) {
                        // Return for frameset docs that don't have a body
                        return;
                }

                container = document.createElement("div");
                container.style.cssText = "visibility:hidden;border:0;width:0;height:0;position:static;top:0;margin-top:1px";
                body.insertBefore( container, body.firstChild );

                // Construct the test element
                div = document.createElement("div");
                container.appendChild( div );

                // Check if table cells still have offsetWidth/Height when they are set
                // to display:none and there are still other visible table cells in a
                // table row; if so, offsetWidth/Height are not reliable for use when
                // determining if an element has been hidden directly using
                // display:none (it is still safe to use offsets if a parent element is
                // hidden; don safety goggles and see bug #4512 for more information).
                // (only IE 8 fails this test)
                div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
                tds = div.getElementsByTagName("td");
                tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
                isSupported = ( tds[ 0 ].offsetHeight === 0 );

                tds[ 0 ].style.display = "";
                tds[ 1 ].style.display = "none";

                // Check if empty table cells still have offsetWidth/Height
                // (IE <= 8 fail this test)
                support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

                // Check box-sizing and margin behavior
                div.innerHTML = "";
                div.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;";
                support.boxSizing = ( div.offsetWidth === 4 );
                support.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== 1 );

                // NOTE: To any future maintainer, we've window.getComputedStyle
                // because jsdom on node.js will break without it.
                if ( window.getComputedStyle ) {
                        support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
                        support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

                        // Check if div with explicit width and no margin-right incorrectly
                        // gets computed margin-right based on width of container. For more
                        // info see bug #3333
                        // Fails in WebKit before Feb 2011 nightlies
                        // WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
                        marginDiv = document.createElement("div");
                        marginDiv.style.cssText = div.style.cssText = divReset;
                        marginDiv.style.marginRight = marginDiv.style.width = "0";
                        div.style.width = "1px";
                        div.appendChild( marginDiv );
                        support.reliableMarginRight =
                                !parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
                }

                if ( typeof div.style.zoom !== "undefined" ) {
                        // Check if natively block-level elements act like inline-block
                        // elements when setting their display to 'inline' and giving
                        // them layout
                        // (IE < 8 does this)
                        div.innerHTML = "";
                        div.style.cssText = divReset + "width:1px;padding:1px;display:inline;zoom:1";
                        support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

                        // Check if elements with layout shrink-wrap their children
                        // (IE 6 does this)
                        div.style.display = "block";
                        div.style.overflow = "visible";
                        div.innerHTML = "<div></div>";
                        div.firstChild.style.width = "5px";
                        support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );

                        container.style.zoom = 1;
                }

                // Null elements to avoid leaks in IE
                body.removeChild( container );
                container = div = tds = marginDiv = null;
        });

        // Null elements to avoid leaks in IE
        fragment.removeChild( div );
        all = a = select = opt = input = fragment = div = null;

        return support;
})();
var rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
        rmultiDash = /([A-Z])/g;

jQuery.extend({
        cache: {},

        deletedIds: [],

        // Remove at next major release (1.9/2.0)
        uuid: 0,

        // Unique for each copy of jQuery on the page
        // Non-digits removed to match rinlinejQuery
        expando: "jQuery" + ( jQuery.fn.jquery + Math.random() ).replace( /\D/g, "" ),

        // The following elements throw uncatchable exceptions if you
        // attempt to add expando properties to them.
        noData: {
                "embed": true,
                // Ban all objects except for Flash (which handle expandos)
                "object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
                "applet": true
        },

        hasData: function( elem ) {
                elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
                return !!elem && !isEmptyDataObject( elem );
        },

        data: function( elem, name, data, pvt /* Internal Use Only */ ) {
                if ( !jQuery.acceptData( elem ) ) {
                        return;
                }

                var thisCache, ret,
                        internalKey = jQuery.expando,
                        getByName = typeof name === "string",

                        // We have to handle DOM nodes and JS objects differently because IE6-7
                        // can't GC object references properly across the DOM-JS boundary
                        isNode = elem.nodeType,

                        // Only DOM nodes need the global jQuery cache; JS object data is
                        // attached directly to the object so GC can occur automatically
                        cache = isNode ? jQuery.cache : elem,

                        // Only defining an ID for JS objects if its cache already exists allows
                        // the code to shortcut on the same path as a DOM node with no cache
                        id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

                // Avoid doing any more work than we need to when trying to get data on an
                // object that has no data at all
                if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && getByName && data === undefined ) {
                        return;
                }

                if ( !id ) {
                        // Only DOM nodes need a new unique ID for each element since their data
                        // ends up in the global cache
                        if ( isNode ) {
                                elem[ internalKey ] = id = jQuery.deletedIds.pop() || jQuery.guid++;
                        } else {
                                id = internalKey;
                        }
                }

                if ( !cache[ id ] ) {
                        cache[ id ] = {};

                        // Avoids exposing jQuery metadata on plain JS objects when the object
                        // is serialized using JSON.stringify
                        if ( !isNode ) {
                                cache[ id ].toJSON = jQuery.noop;
                        }
                }

                // An object can be passed to jQuery.data instead of a key/value pair; this gets
                // shallow copied over onto the existing cache
                if ( typeof name === "object" || typeof name === "function" ) {
                        if ( pvt ) {
                                cache[ id ] = jQuery.extend( cache[ id ], name );
                        } else {
                                cache[ id ].data = jQuery.extend( cache[ id ].data, name );
                        }
                }

                thisCache = cache[ id ];

                // jQuery data() is stored in a separate object inside the object's internal data
                // cache in order to avoid key collisions between internal data and user-defined
                // data.
                if ( !pvt ) {
                        if ( !thisCache.data ) {
                                thisCache.data = {};
                        }

                        thisCache = thisCache.data;
                }

                if ( data !== undefined ) {
                        thisCache[ jQuery.camelCase( name ) ] = data;
                }

                // Check for both converted-to-camel and non-converted data property names
                // If a data property was specified
                if ( getByName ) {

                        // First Try to find as-is property data
                        ret = thisCache[ name ];

                        // Test for null|undefined property data
                        if ( ret == null ) {

                                // Try to find the camelCased property
                                ret = thisCache[ jQuery.camelCase( name ) ];
                        }
                } else {
                        ret = thisCache;
                }

                return ret;
        },

        removeData: function( elem, name, pvt /* Internal Use Only */ ) {
                if ( !jQuery.acceptData( elem ) ) {
                        return;
                }

                var thisCache, i, l,

                        isNode = elem.nodeType,

                        // See jQuery.data for more information
                        cache = isNode ? jQuery.cache : elem,
                        id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

                // If there is already no cache entry for this object, there is no
                // purpose in continuing
                if ( !cache[ id ] ) {
                        return;
                }

                if ( name ) {

                        thisCache = pvt ? cache[ id ] : cache[ id ].data;

                        if ( thisCache ) {

                                // Support array or space separated string names for data keys
                                if ( !jQuery.isArray( name ) ) {

                                        // try the string as a key before any manipulation
                                        if ( name in thisCache ) {
                                                name = [ name ];
                                        } else {

                                                // split the camel cased version by spaces unless a key with the spaces exists
                                                name = jQuery.camelCase( name );
                                                if ( name in thisCache ) {
                                                        name = [ name ];
                                                } else {
                                                        name = name.split(" ");
                                                }
                                        }
                                }

                                for ( i = 0, l = name.length; i < l; i++ ) {
                                        delete thisCache[ name[i] ];
                                }

                                // If there is no data left in the cache, we want to continue
                                // and let the cache object itself get destroyed
                                if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
                                        return;
                                }
                        }
                }

                // See jQuery.data for more information
                if ( !pvt ) {
                        delete cache[ id ].data;

                        // Don't destroy the parent cache unless the internal data object
                        // had been the only thing left in it
                        if ( !isEmptyDataObject( cache[ id ] ) ) {
                                return;
                        }
                }

                // Destroy the cache
                if ( isNode ) {
                        jQuery.cleanData( [ elem ], true );

                // Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
                } else if ( jQuery.support.deleteExpando || cache != cache.window ) {
                        delete cache[ id ];

                // When all else fails, null
                } else {
                        cache[ id ] = null;
                }
        },

        // For internal use only.
        _data: function( elem, name, data ) {
                return jQuery.data( elem, name, data, true );
        },

        // A method for determining if a DOM node can handle the data expando
        acceptData: function( elem ) {
                var noData = elem.nodeName && jQuery.noData[ elem.nodeName.toLowerCase() ];

                // nodes accept data unless otherwise specified; rejection can be conditional
                return !noData || noData !== true && elem.getAttribute("classid") === noData;
        }
});

jQuery.fn.extend({
        data: function( key, value ) {
                var parts, part, attr, name, l,
                        elem = this[0],
                        i = 0,
                        data = null;

                // Gets all values
                if ( key === undefined ) {
                        if ( this.length ) {
                                data = jQuery.data( elem );

                                if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
                                        attr = elem.attributes;
                                        for ( l = attr.length; i < l; i++ ) {
                                                name = attr[i].name;

                                                if ( !name.indexOf( "data-" ) ) {
                                                        name = jQuery.camelCase( name.substring(5) );

                                                        dataAttr( elem, name, data[ name ] );
                                                }
                                        }
                                        jQuery._data( elem, "parsedAttrs", true );
                                }
                        }

                        return data;
                }

                // Sets multiple values
                if ( typeof key === "object" ) {
                        return this.each(function() {
                                jQuery.data( this, key );
                        });
                }

                parts = key.split( ".", 2 );
                parts[1] = parts[1] ? "." + parts[1] : "";
                part = parts[1] + "!";

                return jQuery.access( this, function( value ) {

                        if ( value === undefined ) {
                                data = this.triggerHandler( "getData" + part, [ parts[0] ] );

                                // Try to fetch any internally stored data first
                                if ( data === undefined && elem ) {
                                        data = jQuery.data( elem, key );
                                        data = dataAttr( elem, key, data );
                                }

                                return data === undefined && parts[1] ?
                                        this.data( parts[0] ) :
                                        data;
                        }

                        parts[1] = value;
                        this.each(function() {
                                var self = jQuery( this );

                                self.triggerHandler( "setData" + part, parts );
                                jQuery.data( this, key, value );
                                self.triggerHandler( "changeData" + part, parts );
                        });
                }, null, value, arguments.length > 1, null, false );
        },

        removeData: function( key ) {
                return this.each(function() {
                        jQuery.removeData( this, key );
                });
        }
});

function dataAttr( elem, key, data ) {
        // If nothing was found internally, try to fetch any
        // data from the HTML5 data-* attribute
        if ( data === undefined && elem.nodeType === 1 ) {

                var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

                data = elem.getAttribute( name );

                if ( typeof data === "string" ) {
                        try {
                                data = data === "true" ? true :
                                data === "false" ? false :
                                data === "null" ? null :
                                // Only convert to a number if it doesn't change the string
                                +data + "" === data ? +data :
                                rbrace.test( data ) ? jQuery.parseJSON( data ) :
                                        data;
                        } catch( e ) {}

                        // Make sure we set the data so it isn't changed later
                        jQuery.data( elem, key, data );

                } else {
                        data = undefined;
                }
        }

        return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
        var name;
        for ( name in obj ) {

                // if the public data object is empty, the private is still empty
                if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
                        continue;
                }
                if ( name !== "toJSON" ) {
                        return false;
                }
        }

        return true;
}
jQuery.extend({
        queue: function( elem, type, data ) {
                var queue;

                if ( elem ) {
                        type = ( type || "fx" ) + "queue";
                        queue = jQuery._data( elem, type );

                        // Speed up dequeue by getting out quickly if this is just a lookup
                        if ( data ) {
                                if ( !queue || jQuery.isArray(data) ) {
                                        queue = jQuery._data( elem, type, jQuery.makeArray(data) );
                                } else {
                                        queue.push( data );
                                }
                        }
                        return queue || [];
                }
        },

        dequeue: function( elem, type ) {
                type = type || "fx";

                var queue = jQuery.queue( elem, type ),
                        startLength = queue.length,
                        fn = queue.shift(),
                        hooks = jQuery._queueHooks( elem, type ),
                        next = function() {
                                jQuery.dequeue( elem, type );
                        };

                // If the fx queue is dequeued, always remove the progress sentinel
                if ( fn === "inprogress" ) {
                        fn = queue.shift();
                        startLength--;
                }

                if ( fn ) {

                        // Add a progress sentinel to prevent the fx queue from being
                        // automatically dequeued
                        if ( type === "fx" ) {
                                queue.unshift( "inprogress" );
                        }

                        // clear up the last queue stop function
                        delete hooks.stop;
                        fn.call( elem, next, hooks );
                }

                if ( !startLength && hooks ) {
                        hooks.empty.fire();
                }
        },

        // not intended for public consumption - generates a queueHooks object, or returns the current one
        _queueHooks: function( elem, type ) {
                var key = type + "queueHooks";
                return jQuery._data( elem, key ) || jQuery._data( elem, key, {
                        empty: jQuery.Callbacks("once memory").add(function() {
                                jQuery.removeData( elem, type + "queue", true );
                                jQuery.removeData( elem, key, true );
                        })
                });
        }
});

jQuery.fn.extend({
        queue: function( type, data ) {
                var setter = 2;

                if ( typeof type !== "string" ) {
                        data = type;
                        type = "fx";
                        setter--;
                }

                if ( arguments.length < setter ) {
                        return jQuery.queue( this[0], type );
                }

                return data === undefined ?
                        this :
                        this.each(function() {
                                var queue = jQuery.queue( this, type, data );

                                // ensure a hooks for this queue
                                jQuery._queueHooks( this, type );

                                if ( type === "fx" && queue[0] !== "inprogress" ) {
                                        jQuery.dequeue( this, type );
                                }
                        });
        },
        dequeue: function( type ) {
                return this.each(function() {
                        jQuery.dequeue( this, type );
                });
        },
        // Based off of the plugin by Clint Helfers, with permission.
        // http://blindsignals.com/index.php/2009/07/jquery-delay/
        delay: function( time, type ) {
                time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
                type = type || "fx";

                return this.queue( type, function( next, hooks ) {
                        var timeout = setTimeout( next, time );
                        hooks.stop = function() {
                                clearTimeout( timeout );
                        };
                });
        },
        clearQueue: function( type ) {
                return this.queue( type || "fx", [] );
        },
        // Get a promise resolved when queues of a certain type
        // are emptied (fx is the type by default)
        promise: function( type, obj ) {
                var tmp,
                        count = 1,
                        defer = jQuery.Deferred(),
                        elements = this,
                        i = this.length,
                        resolve = function() {
                                if ( !( --count ) ) {
                                        defer.resolveWith( elements, [ elements ] );
                                }
                        };

                if ( typeof type !== "string" ) {
                        obj = type;
                        type = undefined;
                }
                type = type || "fx";

                while( i-- ) {
                        tmp = jQuery._data( elements[ i ], type + "queueHooks" );
                        if ( tmp && tmp.empty ) {
                                count++;
                                tmp.empty.add( resolve );
                        }
                }
                resolve();
                return defer.promise( obj );
        }
});
var nodeHook, boolHook, fixSpecified,
        rclass = /[\t\r\n]/g,
        rreturn = /\r/g,
        rtype = /^(?:button|input)$/i,
        rfocusable = /^(?:button|input|object|select|textarea)$/i,
        rclickable = /^a(?:rea|)$/i,
        rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
        getSetAttribute = jQuery.support.getSetAttribute;

jQuery.fn.extend({
        attr: function( name, value ) {
                return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
        },

        removeAttr: function( name ) {
                return this.each(function() {
                        jQuery.removeAttr( this, name );
                });
        },

        prop: function( name, value ) {
                return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
        },

        removeProp: function( name ) {
                name = jQuery.propFix[ name ] || name;
                return this.each(function() {
                        // try/catch handles cases where IE balks (such as removing a property on window)
                        try {
                                this[ name ] = undefined;
                                delete this[ name ];
                        } catch( e ) {}
                });
        },

        addClass: function( value ) {
                var classNames, i, l, elem,
                        setClass, c, cl;

                if ( jQuery.isFunction( value ) ) {
                        return this.each(function( j ) {
                                jQuery( this ).addClass( value.call(this, j, this.className) );
                        });
                }

                if ( value && typeof value === "string" ) {
                        classNames = value.split( core_rspace );

                        for ( i = 0, l = this.length; i < l; i++ ) {
                                elem = this[ i ];

                                if ( elem.nodeType === 1 ) {
                                        if ( !elem.className && classNames.length === 1 ) {
                                                elem.className = value;

                                        } else {
                                                setClass = " " + elem.className + " ";

                                                for ( c = 0, cl = classNames.length; c < cl; c++ ) {
                                                        if ( setClass.indexOf( " " + classNames[ c ] + " " ) < 0 ) {
                                                                setClass += classNames[ c ] + " ";
                                                        }
                                                }
                                                elem.className = jQuery.trim( setClass );
                                        }
                                }
                        }
                }

                return this;
        },

        removeClass: function( value ) {
                var removes, className, elem, c, cl, i, l;

                if ( jQuery.isFunction( value ) ) {
                        return this.each(function( j ) {
                                jQuery( this ).removeClass( value.call(this, j, this.className) );
                        });
                }
                if ( (value && typeof value === "string") || value === undefined ) {
                        removes = ( value || "" ).split( core_rspace );

                        for ( i = 0, l = this.length; i < l; i++ ) {
                                elem = this[ i ];
                                if ( elem.nodeType === 1 && elem.className ) {

                                        className = (" " + elem.className + " ").replace( rclass, " " );

                                        // loop over each item in the removal list
                                        for ( c = 0, cl = removes.length; c < cl; c++ ) {
                                                // Remove until there is nothing to remove,
                                                while ( className.indexOf(" " + removes[ c ] + " ") >= 0 ) {
                                                        className = className.replace( " " + removes[ c ] + " " , " " );
                                                }
                                        }
                                        elem.className = value ? jQuery.trim( className ) : "";
                                }
                        }
                }

                return this;
        },

        toggleClass: function( value, stateVal ) {
                var type = typeof value,
                        isBool = typeof stateVal === "boolean";

                if ( jQuery.isFunction( value ) ) {
                        return this.each(function( i ) {
                                jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
                        });
                }

                return this.each(function() {
                        if ( type === "string" ) {
                                // toggle individual class names
                                var className,
                                        i = 0,
                                        self = jQuery( this ),
                                        state = stateVal,
                                        classNames = value.split( core_rspace );

                                while ( (className = classNames[ i++ ]) ) {
                                        // check each className given, space separated list
                                        state = isBool ? state : !self.hasClass( className );
                                        self[ state ? "addClass" : "removeClass" ]( className );
                                }

                        } else if ( type === "undefined" || type === "boolean" ) {
                                if ( this.className ) {
                                        // store className if set
                                        jQuery._data( this, "__className__", this.className );
                                }

                                // toggle whole className
                                this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
                        }
                });
        },

        hasClass: function( selector ) {
                var className = " " + selector + " ",
                        i = 0,
                        l = this.length;
                for ( ; i < l; i++ ) {
                        if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
                                return true;
                        }
                }

                return false;
        },

        val: function( value ) {
                var hooks, ret, isFunction,
                        elem = this[0];

                if ( !arguments.length ) {
                        if ( elem ) {
                                hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

                                if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
                                        return ret;
                                }

                                ret = elem.value;

                                return typeof ret === "string" ?
                                        // handle most common string cases
                                        ret.replace(rreturn, "") :
                                        // handle cases where value is null/undef or number
                                        ret == null ? "" : ret;
                        }

                        return;
                }

                isFunction = jQuery.isFunction( value );

                return this.each(function( i ) {
                        var val,
                                self = jQuery(this);

                        if ( this.nodeType !== 1 ) {
                                return;
                        }

                        if ( isFunction ) {
                                val = value.call( this, i, self.val() );
                        } else {
                                val = value;
                        }

                        // Treat null/undefined as ""; convert numbers to string
                        if ( val == null ) {
                                val = "";
                        } else if ( typeof val === "number" ) {
                                val += "";
                        } else if ( jQuery.isArray( val ) ) {
                                val = jQuery.map(val, function ( value ) {
                                        return value == null ? "" : value + "";
                                });
                        }

                        hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

                        // If set returns undefined, fall back to normal setting
                        if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
                                this.value = val;
                        }
                });
        }
});

jQuery.extend({
        valHooks: {
                option: {
                        get: function( elem ) {
                                // attributes.value is undefined in Blackberry 4.7 but
                                // uses .value. See #6932
                                var val = elem.attributes.value;
                                return !val || val.specified ? elem.value : elem.text;
                        }
                },
                select: {
                        get: function( elem ) {
                                var value, option,
                                        options = elem.options,
                                        index = elem.selectedIndex,
                                        one = elem.type === "select-one" || index < 0,
                                        values = one ? null : [],
                                        max = one ? index + 1 : options.length,
                                        i = index < 0 ?
                                                max :
                                                one ? index : 0;

                                // Loop through all the selected options
                                for ( ; i < max; i++ ) {
                                        option = options[ i ];

                                        // oldIE doesn't update selected after form reset (#2551)
                                        if ( ( option.selected || i === index ) &&
                                                        // Don't return options that are disabled or in a disabled optgroup
                                                        ( jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
                                                        ( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

                                                // Get the specific value for the option
                                                value = jQuery( option ).val();

                                                // We don't need an array for one selects
                                                if ( one ) {
                                                        return value;
                                                }

                                                // Multi-Selects return an array
                                                values.push( value );
                                        }
                                }

                                return values;
                        },

                        set: function( elem, value ) {
                                var values = jQuery.makeArray( value );

                                jQuery(elem).find("option").each(function() {
                                        this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
                                });

                                if ( !values.length ) {
                                        elem.selectedIndex = -1;
                                }
                                return values;
                        }
                }
        },

        // Unused in 1.8, left in so attrFn-stabbers won't die; remove in 1.9
        attrFn: {},

        attr: function( elem, name, value, pass ) {
                var ret, hooks, notxml,
                        nType = elem.nodeType;

                // don't get/set attributes on text, comment and attribute nodes
                if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
                        return;
                }

                if ( pass && jQuery.isFunction( jQuery.fn[ name ] ) ) {
                        return jQuery( elem )[ name ]( value );
                }

                // Fallback to prop when attributes are not supported
                if ( typeof elem.getAttribute === "undefined" ) {
                        return jQuery.prop( elem, name, value );
                }

                notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

                // All attributes are lowercase
                // Grab necessary hook if one is defined
                if ( notxml ) {
                        name = name.toLowerCase();
                        hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
                }

                if ( value !== undefined ) {

                        if ( value === null ) {
                                jQuery.removeAttr( elem, name );
                                return;

                        } else if ( hooks && "set" in hooks && notxml && (ret = hooks.set( elem, value, name )) !== undefined ) {
                                return ret;

                        } else {
                                elem.setAttribute( name, value + "" );
                                return value;
                        }

                } else if ( hooks && "get" in hooks && notxml && (ret = hooks.get( elem, name )) !== null ) {
                        return ret;

                } else {

                        ret = elem.getAttribute( name );

                        // Non-existent attributes return null, we normalize to undefined
                        return ret === null ?
                                undefined :
                                ret;
                }
        },

        removeAttr: function( elem, value ) {
                var propName, attrNames, name, isBool,
                        i = 0;

                if ( value && elem.nodeType === 1 ) {

                        attrNames = value.split( core_rspace );

                        for ( ; i < attrNames.length; i++ ) {
                                name = attrNames[ i ];

                                if ( name ) {
                                        propName = jQuery.propFix[ name ] || name;
                                        isBool = rboolean.test( name );

                                        // See #9699 for explanation of this approach (setting first, then removal)
                                        // Do not do this for boolean attributes (see #10870)
                                        if ( !isBool ) {
                                                jQuery.attr( elem, name, "" );
                                        }
                                        elem.removeAttribute( getSetAttribute ? name : propName );

                                        // Set corresponding property to false for boolean attributes
                                        if ( isBool && propName in elem ) {
                                                elem[ propName ] = false;
                                        }
                                }
                        }
                }
        },

        attrHooks: {
                type: {
                        set: function( elem, value ) {
                                // We can't allow the type property to be changed (since it causes problems in IE)
                                if ( rtype.test( elem.nodeName ) && elem.parentNode ) {
                                        jQuery.error( "type property can't be changed" );
                                } else if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
                                        // Setting the type on a radio button after the value resets the value in IE6-9
                                        // Reset value to it's default in case type is set after value
                                        // This is for element creation
                                        var val = elem.value;
                                        elem.setAttribute( "type", value );
                                        if ( val ) {
                                                elem.value = val;
                                        }
                                        return value;
                                }
                        }
                },
                // Use the value property for back compat
                // Use the nodeHook for button elements in IE6/7 (#1954)
                value: {
                        get: function( elem, name ) {
                                if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
                                        return nodeHook.get( elem, name );
                                }
                                return name in elem ?
                                        elem.value :
                                        null;
                        },
                        set: function( elem, value, name ) {
                                if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
                                        return nodeHook.set( elem, value, name );
                                }
                                // Does not return so that setAttribute is also used
                                elem.value = value;
                        }
                }
        },

        propFix: {
                tabindex: "tabIndex",
                readonly: "readOnly",
                "for": "htmlFor",
                "class": "className",
                maxlength: "maxLength",
                cellspacing: "cellSpacing",
                cellpadding: "cellPadding",
                rowspan: "rowSpan",
                colspan: "colSpan",
                usemap: "useMap",
                frameborder: "frameBorder",
                contenteditable: "contentEditable"
        },

        prop: function( elem, name, value ) {
                var ret, hooks, notxml,
                        nType = elem.nodeType;

                // don't get/set properties on text, comment and attribute nodes
                if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
                        return;
                }

                notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

                if ( notxml ) {
                        // Fix name and attach hooks
                        name = jQuery.propFix[ name ] || name;
                        hooks = jQuery.propHooks[ name ];
                }

                if ( value !== undefined ) {
                        if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
                                return ret;

                        } else {
                                return ( elem[ name ] = value );
                        }

                } else {
                        if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
                                return ret;

                        } else {
                                return elem[ name ];
                        }
                }
        },

        propHooks: {
                tabIndex: {
                        get: function( elem ) {
                                // elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
                                // http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
                                var attributeNode = elem.getAttributeNode("tabindex");

                                return attributeNode && attributeNode.specified ?
                                        parseInt( attributeNode.value, 10 ) :
                                        rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
                                                0 :
                                                undefined;
                        }
                }
        }
});

// Hook for boolean attributes
boolHook = {
        get: function( elem, name ) {
                // Align boolean attributes with corresponding properties
                // Fall back to attribute presence where some booleans are not supported
                var attrNode,
                        property = jQuery.prop( elem, name );
                return property === true || typeof property !== "boolean" && ( attrNode = elem.getAttributeNode(name) ) && attrNode.nodeValue !== false ?
                        name.toLowerCase() :
                        undefined;
        },
        set: function( elem, value, name ) {
                var propName;
                if ( value === false ) {
                        // Remove boolean attributes when set to false
                        jQuery.removeAttr( elem, name );
                } else {
                        // value is true since we know at this point it's type boolean and not false
                        // Set boolean attributes to the same name and set the DOM property
                        propName = jQuery.propFix[ name ] || name;
                        if ( propName in elem ) {
                                // Only set the IDL specifically if it already exists on the element
                                elem[ propName ] = true;
                        }

                        elem.setAttribute( name, name.toLowerCase() );
                }
                return name;
        }
};

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

        fixSpecified = {
                name: true,
                id: true,
                coords: true
        };

        // Use this for any attribute in IE6/7
        // This fixes almost every IE6/7 issue
        nodeHook = jQuery.valHooks.button = {
                get: function( elem, name ) {
                        var ret;
                        ret = elem.getAttributeNode( name );
                        return ret && ( fixSpecified[ name ] ? ret.value !== "" : ret.specified ) ?
                                ret.value :
                                undefined;
                },
                set: function( elem, value, name ) {
                        // Set the existing or create a new attribute node
                        var ret = elem.getAttributeNode( name );
                        if ( !ret ) {
                                ret = document.createAttribute( name );
                                elem.setAttributeNode( ret );
                        }
                        return ( ret.value = value + "" );
                }
        };

        // Set width and height to auto instead of 0 on empty string( Bug #8150 )
        // This is for removals
        jQuery.each([ "width", "height" ], function( i, name ) {
                jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
                        set: function( elem, value ) {
                                if ( value === "" ) {
                                        elem.setAttribute( name, "auto" );
                                        return value;
                                }
                        }
                });
        });

        // Set contenteditable to false on removals(#10429)
        // Setting to empty string throws an error as an invalid value
        jQuery.attrHooks.contenteditable = {
                get: nodeHook.get,
                set: function( elem, value, name ) {
                        if ( value === "" ) {
                                value = "false";
                        }
                        nodeHook.set( elem, value, name );
                }
        };
}


// Some attributes require a special call on IE
if ( !jQuery.support.hrefNormalized ) {
        jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
                jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
                        get: function( elem ) {
                                var ret = elem.getAttribute( name, 2 );
                                return ret === null ? undefined : ret;
                        }
                });
        });
}

if ( !jQuery.support.style ) {
        jQuery.attrHooks.style = {
                get: function( elem ) {
                        // Return undefined in the case of empty string
                        // Normalize to lowercase since IE uppercases css property names
                        return elem.style.cssText.toLowerCase() || undefined;
                },
                set: function( elem, value ) {
                        return ( elem.style.cssText = value + "" );
                }
        };
}

// Safari mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !jQuery.support.optSelected ) {
        jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
                get: function( elem ) {
                        var parent = elem.parentNode;

                        if ( parent ) {
                                parent.selectedIndex;

                                // Make sure that it also works with optgroups, see #5701
                                if ( parent.parentNode ) {
                                        parent.parentNode.selectedIndex;
                                }
                        }
                        return null;
                }
        });
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
        jQuery.propFix.enctype = "encoding";
}

// Radios and checkboxes getter/setter
if ( !jQuery.support.checkOn ) {
        jQuery.each([ "radio", "checkbox" ], function() {
                jQuery.valHooks[ this ] = {
                        get: function( elem ) {
                                // Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
                                return elem.getAttribute("value") === null ? "on" : elem.value;
                        }
                };
        });
}
jQuery.each([ "radio", "checkbox" ], function() {
        jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
                set: function( elem, value ) {
                        if ( jQuery.isArray( value ) ) {
                                return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
                        }
                }
        });
});
var rformElems = /^(?:textarea|input|select)$/i,
        rtypenamespace = /^([^\.]*|)(?:\.(.+)|)$/,
        rhoverHack = /(?:^|\s)hover(\.\S+|)\b/,
        rkeyEvent = /^key/,
        rmouseEvent = /^(?:mouse|contextmenu)|click/,
        rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
        hoverHack = function( events ) {
                return jQuery.event.special.hover ? events : events.replace( rhoverHack, "mouseenter$1 mouseleave$1" );
        };

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

        add: function( elem, types, handler, data, selector ) {

                var elemData, eventHandle, events,
                        t, tns, type, namespaces, handleObj,
                        handleObjIn, handlers, special;

                // Don't attach events to noData or text/comment nodes (allow plain objects tho)
                if ( elem.nodeType === 3 || elem.nodeType === 8 || !types || !handler || !(elemData = jQuery._data( elem )) ) {
                        return;
                }

                // Caller can pass in an object of custom data in lieu of the handler
                if ( handler.handler ) {
                        handleObjIn = handler;
                        handler = handleObjIn.handler;
                        selector = handleObjIn.selector;
                }

                // Make sure that the handler has a unique ID, used to find/remove it later
                if ( !handler.guid ) {
                        handler.guid = jQuery.guid++;
                }

                // Init the element's event structure and main handler, if this is the first
                events = elemData.events;
                if ( !events ) {
                        elemData.events = events = {};
                }
                eventHandle = elemData.handle;
                if ( !eventHandle ) {
                        elemData.handle = eventHandle = function( e ) {
                                // Discard the second event of a jQuery.event.trigger() and
                                // when an event is called after a page has unloaded
                                return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
                                        jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
                                        undefined;
                        };
                        // Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
                        eventHandle.elem = elem;
                }

                // Handle multiple events separated by a space
                // jQuery(...).bind("mouseover mouseout", fn);
                types = jQuery.trim( hoverHack(types) ).split( " " );
                for ( t = 0; t < types.length; t++ ) {

                        tns = rtypenamespace.exec( types[t] ) || [];
                        type = tns[1];
                        namespaces = ( tns[2] || "" ).split( "." ).sort();

                        // If event changes its type, use the special event handlers for the changed type
                        special = jQuery.event.special[ type ] || {};

                        // If selector defined, determine special event api type, otherwise given type
                        type = ( selector ? special.delegateType : special.bindType ) || type;

                        // Update special based on newly reset type
                        special = jQuery.event.special[ type ] || {};

                        // handleObj is passed to all event handlers
                        handleObj = jQuery.extend({
                                type: type,
                                origType: tns[1],
                                data: data,
                                handler: handler,
                                guid: handler.guid,
                                selector: selector,
                                needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
                                namespace: namespaces.join(".")
                        }, handleObjIn );

                        // Init the event handler queue if we're the first
                        handlers = events[ type ];
                        if ( !handlers ) {
                                handlers = events[ type ] = [];
                                handlers.delegateCount = 0;

                                // Only use addEventListener/attachEvent if the special events handler returns false
                                if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
                                        // Bind the global event handler to the element
                                        if ( elem.addEventListener ) {
                                                elem.addEventListener( type, eventHandle, false );

                                        } else if ( elem.attachEvent ) {
                                                elem.attachEvent( "on" + type, eventHandle );
                                        }
                                }
                        }

                        if ( special.add ) {
                                special.add.call( elem, handleObj );

                                if ( !handleObj.handler.guid ) {
                                        handleObj.handler.guid = handler.guid;
                                }
                        }

                        // Add to the element's handler list, delegates in front
                        if ( selector ) {
                                handlers.splice( handlers.delegateCount++, 0, handleObj );
                        } else {
                                handlers.push( handleObj );
                        }

                        // Keep track of which events have ever been used, for event optimization
                        jQuery.event.global[ type ] = true;
                }

                // Nullify elem to prevent memory leaks in IE
                elem = null;
        },

        global: {},

        // Detach an event or set of events from an element
        remove: function( elem, types, handler, selector, mappedTypes ) {

                var t, tns, type, origType, namespaces, origCount,
                        j, events, special, eventType, handleObj,
                        elemData = jQuery.hasData( elem ) && jQuery._data( elem );

                if ( !elemData || !(events = elemData.events) ) {
                        return;
                }

                // Once for each type.namespace in types; type may be omitted
                types = jQuery.trim( hoverHack( types || "" ) ).split(" ");
                for ( t = 0; t < types.length; t++ ) {
                        tns = rtypenamespace.exec( types[t] ) || [];
                        type = origType = tns[1];
                        namespaces = tns[2];

                        // Unbind all events (on this namespace, if provided) for the element
                        if ( !type ) {
                                for ( type in events ) {
                                        jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
                                }
                                continue;
                        }

                        special = jQuery.event.special[ type ] || {};
                        type = ( selector? special.delegateType : special.bindType ) || type;
                        eventType = events[ type ] || [];
                        origCount = eventType.length;
                        namespaces = namespaces ? new RegExp("(^|\\.)" + namespaces.split(".").sort().join("\\.(?:.*\\.|)") + "(\\.|$)") : null;

                        // Remove matching events
                        for ( j = 0; j < eventType.length; j++ ) {
                                handleObj = eventType[ j ];

                                if ( ( mappedTypes || origType === handleObj.origType ) &&
                                         ( !handler || handler.guid === handleObj.guid ) &&
                                         ( !namespaces || namespaces.test( handleObj.namespace ) ) &&
                                         ( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
                                        eventType.splice( j--, 1 );

                                        if ( handleObj.selector ) {
                                                eventType.delegateCount--;
                                        }
                                        if ( special.remove ) {
                                                special.remove.call( elem, handleObj );
                                        }
                                }
                        }

                        // Remove generic event handler if we removed something and no more handlers exist
                        // (avoids potential for endless recursion during removal of special event handlers)
                        if ( eventType.length === 0 && origCount !== eventType.length ) {
                                if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
                                        jQuery.removeEvent( elem, type, elemData.handle );
                                }

                                delete events[ type ];
                        }
                }

                // Remove the expando if it's no longer used
                if ( jQuery.isEmptyObject( events ) ) {
                        delete elemData.handle;

                        // removeData also checks for emptiness and clears the expando if empty
                        // so use it instead of delete
                        jQuery.removeData( elem, "events", true );
                }
        },

        // Events that are safe to short-circuit if no handlers are attached.
        // Native DOM events should not be added, they may have inline handlers.
        customEvent: {
                "getData": true,
                "setData": true,
                "changeData": true
        },

        trigger: function( event, data, elem, onlyHandlers ) {
                // Don't do events on text and comment nodes
                if ( elem && (elem.nodeType === 3 || elem.nodeType === 8) ) {
                        return;
                }

                // Event object or event type
                var cache, exclusive, i, cur, old, ontype, special, handle, eventPath, bubbleType,
                        type = event.type || event,
                        namespaces = [];

                // focus/blur morphs to focusin/out; ensure we're not firing them right now
                if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
                        return;
                }

                if ( type.indexOf( "!" ) >= 0 ) {
                        // Exclusive events trigger only for the exact event (no namespaces)
                        type = type.slice(0, -1);
                        exclusive = true;
                }

                if ( type.indexOf( "." ) >= 0 ) {
                        // Namespaced trigger; create a regexp to match event type in handle()
                        namespaces = type.split(".");
                        type = namespaces.shift();
                        namespaces.sort();
                }

                if ( (!elem || jQuery.event.customEvent[ type ]) && !jQuery.event.global[ type ] ) {
                        // No jQuery handlers for this event type, and it can't have inline handlers
                        return;
                }

                // Caller can pass in an Event, Object, or just an event type string
                event = typeof event === "object" ?
                        // jQuery.Event object
                        event[ jQuery.expando ] ? event :
                        // Object literal
                        new jQuery.Event( type, event ) :
                        // Just the event type (string)
                        new jQuery.Event( type );

                event.type = type;
                event.isTrigger = true;
                event.exclusive = exclusive;
                event.namespace = namespaces.join( "." );
                event.namespace_re = event.namespace? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)") : null;
                ontype = type.indexOf( ":" ) < 0 ? "on" + type : "";

                // Handle a global trigger
                if ( !elem ) {

                        // TODO: Stop taunting the data cache; remove global events and always attach to document
                        cache = jQuery.cache;
                        for ( i in cache ) {
                                if ( cache[ i ].events && cache[ i ].events[ type ] ) {
                                        jQuery.event.trigger( event, data, cache[ i ].handle.elem, true );
                                }
                        }
                        return;
                }

                // Clean up the event in case it is being reused
                event.result = undefined;
                if ( !event.target ) {
                        event.target = elem;
                }

                // Clone any incoming data and prepend the event, creating the handler arg list
                data = data != null ? jQuery.makeArray( data ) : [];
                data.unshift( event );

                // Allow special events to draw outside the lines
                special = jQuery.event.special[ type ] || {};
                if ( special.trigger && special.trigger.apply( elem, data ) === false ) {
                        return;
                }

                // Determine event propagation path in advance, per W3C events spec (#9951)
                // Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
                eventPath = [[ elem, special.bindType || type ]];
                if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

                        bubbleType = special.delegateType || type;
                        cur = rfocusMorph.test( bubbleType + type ) ? elem : elem.parentNode;
                        for ( old = elem; cur; cur = cur.parentNode ) {
                                eventPath.push([ cur, bubbleType ]);
                                old = cur;
                        }

                        // Only add window if we got to document (e.g., not plain obj or detached DOM)
                        if ( old === (elem.ownerDocument || document) ) {
                                eventPath.push([ old.defaultView || old.parentWindow || window, bubbleType ]);
                        }
                }

                // Fire handlers on the event path
                for ( i = 0; i < eventPath.length && !event.isPropagationStopped(); i++ ) {

                        cur = eventPath[i][0];
                        event.type = eventPath[i][1];

                        handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
                        if ( handle ) {
                                handle.apply( cur, data );
                        }
                        // Note that this is a bare JS function and not a jQuery handler
                        handle = ontype && cur[ ontype ];
                        if ( handle && jQuery.acceptData( cur ) && handle.apply && handle.apply( cur, data ) === false ) {
                                event.preventDefault();
                        }
                }
                event.type = type;

                // If nobody prevented the default action, do it now
                if ( !onlyHandlers && !event.isDefaultPrevented() ) {

                        if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
                                !(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

                                // Call a native DOM method on the target with the same name name as the event.
                                // Can't use an .isFunction() check here because IE6/7 fails that test.
                                // Don't do default actions on window, that's where global variables be (#6170)
                                // IE<9 dies on focus/blur to hidden element (#1486)
                                if ( ontype && elem[ type ] && ((type !== "focus" && type !== "blur") || event.target.offsetWidth !== 0) && !jQuery.isWindow( elem ) ) {

                                        // Don't re-trigger an onFOO event when we call its FOO() method
                                        old = elem[ ontype ];

                                        if ( old ) {
                                                elem[ ontype ] = null;
                                        }

                                        // Prevent re-triggering of the same event, since we already bubbled it above
                                        jQuery.event.triggered = type;
                                        elem[ type ]();
                                        jQuery.event.triggered = undefined;

                                        if ( old ) {
                                                elem[ ontype ] = old;
                                        }
                                }
                        }
                }

                return event.result;
        },

        dispatch: function( event ) {

                // Make a writable jQuery.Event from the native event object
                event = jQuery.event.fix( event || window.event );

                var i, j, cur, ret, selMatch, matched, matches, handleObj, sel, related,
                        handlers = ( (jQuery._data( this, "events" ) || {} )[ event.type ] || []),
                        delegateCount = handlers.delegateCount,
                        args = core_slice.call( arguments ),
                        run_all = !event.exclusive && !event.namespace,
                        special = jQuery.event.special[ event.type ] || {},
                        handlerQueue = [];

                // Use the fix-ed jQuery.Event rather than the (read-only) native event
                args[0] = event;
                event.delegateTarget = this;

                // Call the preDispatch hook for the mapped type, and let it bail if desired
                if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
                        return;
                }

                // Determine handlers that should run if there are delegated events
                // Avoid non-left-click bubbling in Firefox (#3861)
                if ( delegateCount && !(event.button && event.type === "click") ) {

                        for ( cur = event.target; cur != this; cur = cur.parentNode || this ) {

                                // Don't process clicks (ONLY) on disabled elements (#6911, #8165, #11382, #11764)
                                if ( cur.disabled !== true || event.type !== "click" ) {
                                        selMatch = {};
                                        matches = [];
                                        for ( i = 0; i < delegateCount; i++ ) {
                                                handleObj = handlers[ i ];
                                                sel = handleObj.selector;

                                                if ( selMatch[ sel ] === undefined ) {
                                                        selMatch[ sel ] = handleObj.needsContext ?
                                                                jQuery( sel, this ).index( cur ) >= 0 :
                                                                jQuery.find( sel, this, null, [ cur ] ).length;
                                                }
                                                if ( selMatch[ sel ] ) {
                                                        matches.push( handleObj );
                                                }
                                        }
                                        if ( matches.length ) {
                                                handlerQueue.push({ elem: cur, matches: matches });
                                        }
                                }
                        }
                }

                // Add the remaining (directly-bound) handlers
                if ( handlers.length > delegateCount ) {
                        handlerQueue.push({ elem: this, matches: handlers.slice( delegateCount ) });
                }

                // Run delegates first; they may want to stop propagation beneath us
                for ( i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++ ) {
                        matched = handlerQueue[ i ];
                        event.currentTarget = matched.elem;

                        for ( j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++ ) {
                                handleObj = matched.matches[ j ];

                                // Triggered event must either 1) be non-exclusive and have no namespace, or
                                // 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
                                if ( run_all || (!event.namespace && !handleObj.namespace) || event.namespace_re && event.namespace_re.test( handleObj.namespace ) ) {

                                        event.data = handleObj.data;
                                        event.handleObj = handleObj;

                                        ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
                                                        .apply( matched.elem, args );

                                        if ( ret !== undefined ) {
                                                event.result = ret;
                                                if ( ret === false ) {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                }
                                        }
                                }
                        }
                }

                // Call the postDispatch hook for the mapped type
                if ( special.postDispatch ) {
                        special.postDispatch.call( this, event );
                }

                return event.result;
        },

        // Includes some event props shared by KeyEvent and MouseEvent
        // *** attrChange attrName relatedNode srcElement  are not normalized, non-W3C, deprecated, will be removed in 1.8 ***
        props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

        fixHooks: {},

        keyHooks: {
                props: "char charCode key keyCode".split(" "),
                filter: function( event, original ) {

                        // Add which for key events
                        if ( event.which == null ) {
                                event.which = original.charCode != null ? original.charCode : original.keyCode;
                        }

                        return event;
                }
        },

        mouseHooks: {
                props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
                filter: function( event, original ) {
                        var eventDoc, doc, body,
                                button = original.button,
                                fromElement = original.fromElement;

                        // Calculate pageX/Y if missing and clientX/Y available
                        if ( event.pageX == null && original.clientX != null ) {
                                eventDoc = event.target.ownerDocument || document;
                                doc = eventDoc.documentElement;
                                body = eventDoc.body;

                                event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
                                event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
                        }

                        // Add relatedTarget, if necessary
                        if ( !event.relatedTarget && fromElement ) {
                                event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
                        }

                        // Add which for click: 1 === left; 2 === middle; 3 === right
                        // Note: button is not normalized, so don't use it
                        if ( !event.which && button !== undefined ) {
                                event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
                        }

                        return event;
                }
        },

        fix: function( event ) {
                if ( event[ jQuery.expando ] ) {
                        return event;
                }

                // Create a writable copy of the event object and normalize some properties
                var i, prop,
                        originalEvent = event,
                        fixHook = jQuery.event.fixHooks[ event.type ] || {},
                        copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

                event = jQuery.Event( originalEvent );

                for ( i = copy.length; i; ) {
                        prop = copy[ --i ];
                        event[ prop ] = originalEvent[ prop ];
                }

                // Fix target property, if necessary (#1925, IE 6/7/8 & Safari2)
                if ( !event.target ) {
                        event.target = originalEvent.srcElement || document;
                }

                // Target should not be a text node (#504, Safari)
                if ( event.target.nodeType === 3 ) {
                        event.target = event.target.parentNode;
                }

                // For mouse/key events, metaKey==false if it's undefined (#3368, #11328; IE6/7/8)
                event.metaKey = !!event.metaKey;

                return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
        },

        special: {
                load: {
                        // Prevent triggered image.load events from bubbling to window.load
                        noBubble: true
                },

                focus: {
                        delegateType: "focusin"
                },
                blur: {
                        delegateType: "focusout"
                },

                beforeunload: {
                        setup: function( data, namespaces, eventHandle ) {
                                // We only want to do this special case on windows
                                if ( jQuery.isWindow( this ) ) {
                                        this.onbeforeunload = eventHandle;
                                }
                        },

                        teardown: function( namespaces, eventHandle ) {
                                if ( this.onbeforeunload === eventHandle ) {
                                        this.onbeforeunload = null;
                                }
                        }
                }
        },

        simulate: function( type, elem, event, bubble ) {
                // Piggyback on a donor event to simulate a different one.
                // Fake originalEvent to avoid donor's stopPropagation, but if the
                // simulated event prevents default then we do the same on the donor.
                var e = jQuery.extend(
                        new jQuery.Event(),
                        event,
                        { type: type,
                                isSimulated: true,
                                originalEvent: {}
                        }
                );
                if ( bubble ) {
                        jQuery.event.trigger( e, null, elem );
                } else {
                        jQuery.event.dispatch.call( elem, e );
                }
                if ( e.isDefaultPrevented() ) {
                        event.preventDefault();
                }
        }
};

// Some plugins are using, but it's undocumented/deprecated and will be removed.
// The 1.7 special event interface should provide all the hooks needed now.
jQuery.event.handle = jQuery.event.dispatch;

jQuery.removeEvent = document.removeEventListener ?
        function( elem, type, handle ) {
                if ( elem.removeEventListener ) {
                        elem.removeEventListener( type, handle, false );
                }
        } :
        function( elem, type, handle ) {
                var name = "on" + type;

                if ( elem.detachEvent ) {

                        // #8545, #7054, preventing memory leaks for custom events in IE6-8
                        // detachEvent needed property on element, by name of that event, to properly expose it to GC
                        if ( typeof elem[ name ] === "undefined" ) {
                                elem[ name ] = null;
                        }

                        elem.detachEvent( name, handle );
                }
        };

jQuery.Event = function( src, props ) {
        // Allow instantiation without the 'new' keyword
        if ( !(this instanceof jQuery.Event) ) {
                return new jQuery.Event( src, props );
        }

        // Event object
        if ( src && src.type ) {
                this.originalEvent = src;
                this.type = src.type;

                // Events bubbling up the document may have been marked as prevented
                // by a handler lower down the tree; reflect the correct value.
                this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
                        src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

        // Event type
        } else {
                this.type = src;
        }

        // Put explicitly provided properties onto the event object
        if ( props ) {
                jQuery.extend( this, props );
        }

        // Create a timestamp if incoming event doesn't have one
        this.timeStamp = src && src.timeStamp || jQuery.now();

        // Mark it as fixed
        this[ jQuery.expando ] = true;
};

function returnFalse() {
        return false;
}
function returnTrue() {
        return true;
}

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
        preventDefault: function() {
                this.isDefaultPrevented = returnTrue;

                var e = this.originalEvent;
                if ( !e ) {
                        return;
                }

                // if preventDefault exists run it on the original event
                if ( e.preventDefault ) {
                        e.preventDefault();

                // otherwise set the returnValue property of the original event to false (IE)
                } else {
                        e.returnValue = false;
                }
        },
        stopPropagation: function() {
                this.isPropagationStopped = returnTrue;

                var e = this.originalEvent;
                if ( !e ) {
                        return;
                }
                // if stopPropagation exists run it on the original event
                if ( e.stopPropagation ) {
                        e.stopPropagation();
                }
                // otherwise set the cancelBubble property of the original event to true (IE)
                e.cancelBubble = true;
        },
        stopImmediatePropagation: function() {
                this.isImmediatePropagationStopped = returnTrue;
                this.stopPropagation();
        },
        isDefaultPrevented: returnFalse,
        isPropagationStopped: returnFalse,
        isImmediatePropagationStopped: returnFalse
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
        mouseenter: "mouseover",
        mouseleave: "mouseout"
}, function( orig, fix ) {
        jQuery.event.special[ orig ] = {
                delegateType: fix,
                bindType: fix,

                handle: function( event ) {
                        var ret,
                                target = this,
                                related = event.relatedTarget,
                                handleObj = event.handleObj,
                                selector = handleObj.selector;

                        // For mousenter/leave call the handler if related is outside the target.
                        // NB: No relatedTarget if the mouse left/entered the browser window
                        if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
                                event.type = handleObj.origType;
                                ret = handleObj.handler.apply( this, arguments );
                                event.type = fix;
                        }
                        return ret;
                }
        };
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

        jQuery.event.special.submit = {
                setup: function() {
                        // Only need this for delegated form submit events
                        if ( jQuery.nodeName( this, "form" ) ) {
                                return false;
                        }

                        // Lazy-add a submit handler when a descendant form may potentially be submitted
                        jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
                                // Node name check avoids a VML-related crash in IE (#9807)
                                var elem = e.target,
                                        form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
                                if ( form && !jQuery._data( form, "_submit_attached" ) ) {
                                        jQuery.event.add( form, "submit._submit", function( event ) {
                                                event._submit_bubble = true;
                                        });
                                        jQuery._data( form, "_submit_attached", true );
                                }
                        });
                        // return undefined since we don't need an event listener
                },

                postDispatch: function( event ) {
                        // If form was submitted by the user, bubble the event up the tree
                        if ( event._submit_bubble ) {
                                delete event._submit_bubble;
                                if ( this.parentNode && !event.isTrigger ) {
                                        jQuery.event.simulate( "submit", this.parentNode, event, true );
                                }
                        }
                },

                teardown: function() {
                        // Only need this for delegated form submit events
                        if ( jQuery.nodeName( this, "form" ) ) {
                                return false;
                        }

                        // Remove delegated handlers; cleanData eventually reaps submit handlers attached above
                        jQuery.event.remove( this, "._submit" );
                }
        };
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

        jQuery.event.special.change = {

                setup: function() {

                        if ( rformElems.test( this.nodeName ) ) {
                                // IE doesn't fire change on a check/radio until blur; trigger it on click
                                // after a propertychange. Eat the blur-change in special.change.handle.
                                // This still fires onchange a second time for check/radio after blur.
                                if ( this.type === "checkbox" || this.type === "radio" ) {
                                        jQuery.event.add( this, "propertychange._change", function( event ) {
                                                if ( event.originalEvent.propertyName === "checked" ) {
                                                        this._just_changed = true;
                                                }
                                        });
                                        jQuery.event.add( this, "click._change", function( event ) {
                                                if ( this._just_changed && !event.isTrigger ) {
                                                        this._just_changed = false;
                                                }
                                                // Allow triggered, simulated change events (#11500)
                                                jQuery.event.simulate( "change", this, event, true );
                                        });
                                }
                                return false;
                        }
                        // Delegated event; lazy-add a change handler on descendant inputs
                        jQuery.event.add( this, "beforeactivate._change", function( e ) {
                                var elem = e.target;

                                if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "_change_attached" ) ) {
                                        jQuery.event.add( elem, "change._change", function( event ) {
                                                if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
                                                        jQuery.event.simulate( "change", this.parentNode, event, true );
                                                }
                                        });
                                        jQuery._data( elem, "_change_attached", true );
                                }
                        });
                },

                handle: function( event ) {
                        var elem = event.target;

                        // Swallow native change events from checkbox/radio, we already triggered them above
                        if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
                                return event.handleObj.handler.apply( this, arguments );
                        }
                },

                teardown: function() {
                        jQuery.event.remove( this, "._change" );

                        return !rformElems.test( this.nodeName );
                }
        };
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
        jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

                // Attach a single capturing handler while someone wants focusin/focusout
                var attaches = 0,
                        handler = function( event ) {
                                jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
                        };

                jQuery.event.special[ fix ] = {
                        setup: function() {
                                if ( attaches++ === 0 ) {
                                        document.addEventListener( orig, handler, true );
                                }
                        },
                        teardown: function() {
                                if ( --attaches === 0 ) {
                                        document.removeEventListener( orig, handler, true );
                                }
                        }
                };
        });
}

jQuery.fn.extend({

        on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
                var origFn, type;

                // Types can be a map of types/handlers
                if ( typeof types === "object" ) {
                        // ( types-Object, selector, data )
                        if ( typeof selector !== "string" ) { // && selector != null
                                // ( types-Object, data )
                                data = data || selector;
                                selector = undefined;
                        }
                        for ( type in types ) {
                                this.on( type, selector, data, types[ type ], one );
                        }
                        return this;
                }

                if ( data == null && fn == null ) {
                        // ( types, fn )
                        fn = selector;
                        data = selector = undefined;
                } else if ( fn == null ) {
                        if ( typeof selector === "string" ) {
                                // ( types, selector, fn )
                                fn = data;
                                data = undefined;
                        } else {
                                // ( types, data, fn )
                                fn = data;
                                data = selector;
                                selector = undefined;
                        }
                }
                if ( fn === false ) {
                        fn = returnFalse;
                } else if ( !fn ) {
                        return this;
                }

                if ( one === 1 ) {
                        origFn = fn;
                        fn = function( event ) {
                                // Can use an empty set, since event contains the info
                                jQuery().off( event );
                                return origFn.apply( this, arguments );
                        };
                        // Use same guid so caller can remove using origFn
                        fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
                }
                return this.each( function() {
                        jQuery.event.add( this, types, fn, data, selector );
                });
        },
        one: function( types, selector, data, fn ) {
                return this.on( types, selector, data, fn, 1 );
        },
        off: function( types, selector, fn ) {
                var handleObj, type;
                if ( types && types.preventDefault && types.handleObj ) {
                        // ( event )  dispatched jQuery.Event
                        handleObj = types.handleObj;
                        jQuery( types.delegateTarget ).off(
                                handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
                                handleObj.selector,
                                handleObj.handler
                        );
                        return this;
                }
                if ( typeof types === "object" ) {
                        // ( types-object [, selector] )
                        for ( type in types ) {
                                this.off( type, selector, types[ type ] );
                        }
                        return this;
                }
                if ( selector === false || typeof selector === "function" ) {
                        // ( types [, fn] )
                        fn = selector;
                        selector = undefined;
                }
                if ( fn === false ) {
                        fn = returnFalse;
                }
                return this.each(function() {
                        jQuery.event.remove( this, types, fn, selector );
                });
        },

        bind: function( types, data, fn ) {
                return this.on( types, null, data, fn );
        },
        unbind: function( types, fn ) {
                return this.off( types, null, fn );
        },

        live: function( types, data, fn ) {
                jQuery( this.context ).on( types, this.selector, data, fn );
                return this;
        },
        die: function( types, fn ) {
                jQuery( this.context ).off( types, this.selector || "**", fn );
                return this;
        },

        delegate: function( selector, types, data, fn ) {
                return this.on( types, selector, data, fn );
        },
        undelegate: function( selector, types, fn ) {
                // ( namespace ) or ( selector, types [, fn] )
                return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
        },

        trigger: function( type, data ) {
                return this.each(function() {
                        jQuery.event.trigger( type, data, this );
                });
        },
        triggerHandler: function( type, data ) {
                if ( this[0] ) {
                        return jQuery.event.trigger( type, data, this[0], true );
                }
        },

        toggle: function( fn ) {
                // Save reference to arguments for access in closure
                var args = arguments,
                        guid = fn.guid || jQuery.guid++,
                        i = 0,
                        toggler = function( event ) {
                                // Figure out which function to execute
                                var lastToggle = ( jQuery._data( this, "lastToggle" + fn.guid ) || 0 ) % i;
                                jQuery._data( this, "lastToggle" + fn.guid, lastToggle + 1 );

                                // Make sure that clicks stop
                                event.preventDefault();

                                // and execute the function
                                return args[ lastToggle ].apply( this, arguments ) || false;
                        };

                // link all the functions, so any of them can unbind this click handler
                toggler.guid = guid;
                while ( i < args.length ) {
                        args[ i++ ].guid = guid;
                }

                return this.click( toggler );
        },

        hover: function( fnOver, fnOut ) {
                return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
        }
});

jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
        "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
        "change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

        // Handle event binding
        jQuery.fn[ name ] = function( data, fn ) {
                if ( fn == null ) {
                        fn = data;
                        data = null;
                }

                return arguments.length > 0 ?
                        this.on( name, null, data, fn ) :
                        this.trigger( name );
        };

        if ( rkeyEvent.test( name ) ) {
                jQuery.event.fixHooks[ name ] = jQuery.event.keyHooks;
        }

        if ( rmouseEvent.test( name ) ) {
                jQuery.event.fixHooks[ name ] = jQuery.event.mouseHooks;
        }
});
/*!
 * Sizzle CSS Selector Engine
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://sizzlejs.com/
 */
(function( window, undefined ) {

var cachedruns,
        assertGetIdNotName,
        Expr,
        getText,
        isXML,
        contains,
        compile,
        sortOrder,
        hasDuplicate,
        outermostContext,

        baseHasDuplicate = true,
        strundefined = "undefined",

        expando = ( "sizcache" + Math.random() ).replace( ".", "" ),

        Token = String,
        document = window.document,
        docElem = document.documentElement,
        dirruns = 0,
        done = 0,
        pop = [].pop,
        push = [].push,
        slice = [].slice,
        // Use a stripped-down indexOf if a native one is unavailable
        indexOf = [].indexOf || function( elem ) {
                var i = 0,
                        len = this.length;
                for ( ; i < len; i++ ) {
                        if ( this[i] === elem ) {
                                return i;
                        }
                }
                return -1;
        },

        // Augment a function for special use by Sizzle
        markFunction = function( fn, value ) {
                fn[ expando ] = value == null || value;
                return fn;
        },

        createCache = function() {
                var cache = {},
                        keys = [];

                return markFunction(function( key, value ) {
                        // Only keep the most recent entries
                        if ( keys.push( key ) > Expr.cacheLength ) {
                                delete cache[ keys.shift() ];
                        }

                        // Retrieve with (key + " ") to avoid collision with native Object.prototype properties (see Issue #157)
                        return (cache[ key + " " ] = value);
                }, cache );
        },

        classCache = createCache(),
        tokenCache = createCache(),
        compilerCache = createCache(),

        // Regex

        // Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
        whitespace = "[\\x20\\t\\r\\n\\f]",
        // http://www.w3.org/TR/css3-syntax/#characters
        characterEncoding = "(?:\\\\.|[-\\w]|[^\\x00-\\xa0])+",

        // Loosely modeled on CSS identifier characters
        // An unquoted value should be a CSS identifier (http://www.w3.org/TR/css3-selectors/#attribute-selectors)
        // Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
        identifier = characterEncoding.replace( "w", "w#" ),

        // Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
        operators = "([*^$|!~]?=)",
        attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
                "*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

        // Prefer arguments not in parens/brackets,
        //   then attribute selectors and non-pseudos (denoted by :),
        //   then anything else
        // These preferences are here to reduce the number of selectors
        //   needing tokenize in the PSEUDO preFilter
        pseudos = ":(" + characterEncoding + ")(?:\\((?:(['\"])((?:\\\\.|[^\\\\])*?)\\2|([^()[\\]]*|(?:(?:" + attributes + ")|[^:]|\\\\.)*|.*))\\)|)",

        // For matchExpr.POS and matchExpr.needsContext
        pos = ":(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
                "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)",

        // Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
        rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

        rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
        rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
        rpseudo = new RegExp( pseudos ),

        // Easily-parseable/retrievable ID or TAG or CLASS selectors
        rquickExpr = /^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/,

        rnot = /^:not/,
        rsibling = /[\x20\t\r\n\f]*[+~]/,
        rendsWithNot = /:not\($/,

        rheader = /h\d/i,
        rinputs = /input|select|textarea|button/i,

        rbackslash = /\\(?!\\)/g,

        matchExpr = {
                "ID": new RegExp( "^#(" + characterEncoding + ")" ),
                "CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
                "NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
                "TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
                "ATTR": new RegExp( "^" + attributes ),
                "PSEUDO": new RegExp( "^" + pseudos ),
                "POS": new RegExp( pos, "i" ),
                "CHILD": new RegExp( "^:(only|nth|first|last)-child(?:\\(" + whitespace +
                        "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
                        "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
                // For use in libraries implementing .is()
                "needsContext": new RegExp( "^" + whitespace + "*[>+~]|" + pos, "i" )
        },

        // Support

        // Used for testing something on an element
        assert = function( fn ) {
                var div = document.createElement("div");

                try {
                        return fn( div );
                } catch (e) {
                        return false;
                } finally {
                        // release memory in IE
                        div = null;
                }
        },

        // Check if getElementsByTagName("*") returns only elements
        assertTagNameNoComments = assert(function( div ) {
                div.appendChild( document.createComment("") );
                return !div.getElementsByTagName("*").length;
        }),

        // Check if getAttribute returns normalized href attributes
        assertHrefNotNormalized = assert(function( div ) {
                div.innerHTML = "<a href='#'></a>";
                return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
                        div.firstChild.getAttribute("href") === "#";
        }),

        // Check if attributes should be retrieved by attribute nodes
        assertAttributes = assert(function( div ) {
                div.innerHTML = "<select></select>";
                var type = typeof div.lastChild.getAttribute("multiple");
                // IE8 returns a string for some attributes even when not present
                return type !== "boolean" && type !== "string";
        }),

        // Check if getElementsByClassName can be trusted
        assertUsableClassName = assert(function( div ) {
                // Opera can't find a second classname (in 9.6)
                div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
                if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
                        return false;
                }

                // Safari 3.2 caches class attributes and doesn't catch changes
                div.lastChild.className = "e";
                return div.getElementsByClassName("e").length === 2;
        }),

        // Check if getElementById returns elements by name
        // Check if getElementsByName privileges form controls or returns elements by ID
        assertUsableName = assert(function( div ) {
                // Inject content
                div.id = expando + 0;
                div.innerHTML = "<a name='" + expando + "'></a><div name='" + expando + "'></div>";
                docElem.insertBefore( div, docElem.firstChild );

                // Test
                var pass = document.getElementsByName &&
                        // buggy browsers will return fewer than the correct 2
                        document.getElementsByName( expando ).length === 2 +
                        // buggy browsers will return more than the correct 0
                        document.getElementsByName( expando + 0 ).length;
                assertGetIdNotName = !document.getElementById( expando );

                // Cleanup
                docElem.removeChild( div );

                return pass;
        });

// If slice is not available, provide a backup
try {
        slice.call( docElem.childNodes, 0 )[0].nodeType;
} catch ( e ) {
        slice = function( i ) {
                var elem,
                        results = [];
                for ( ; (elem = this[i]); i++ ) {
                        results.push( elem );
                }
                return results;
        };
}

function Sizzle( selector, context, results, seed ) {
        results = results || [];
        context = context || document;
        var match, elem, xml, m,
                nodeType = context.nodeType;

        if ( !selector || typeof selector !== "string" ) {
                return results;
        }

        if ( nodeType !== 1 && nodeType !== 9 ) {
                return [];
        }

        xml = isXML( context );

        if ( !xml && !seed ) {
                if ( (match = rquickExpr.exec( selector )) ) {
                        // Speed-up: Sizzle("#ID")
                        if ( (m = match[1]) ) {
                                if ( nodeType === 9 ) {
                                        elem = context.getElementById( m );
                                        // Check parentNode to catch when Blackberry 4.6 returns
                                        // nodes that are no longer in the document #6963
                                        if ( elem && elem.parentNode ) {
                                                // Handle the case where IE, Opera, and Webkit return items
                                                // by name instead of ID
                                                if ( elem.id === m ) {
                                                        results.push( elem );
                                                        return results;
                                                }
                                        } else {
                                                return results;
                                        }
                                } else {
                                        // Context is not a document
                                        if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
                                                contains( context, elem ) && elem.id === m ) {
                                                results.push( elem );
                                                return results;
                                        }
                                }

                        // Speed-up: Sizzle("TAG")
                        } else if ( match[2] ) {
                                push.apply( results, slice.call(context.getElementsByTagName( selector ), 0) );
                                return results;

                        // Speed-up: Sizzle(".CLASS")
                        } else if ( (m = match[3]) && assertUsableClassName && context.getElementsByClassName ) {
                                push.apply( results, slice.call(context.getElementsByClassName( m ), 0) );
                                return results;
                        }
                }
        }

        // All others
        return select( selector.replace( rtrim, "$1" ), context, results, seed, xml );
}

Sizzle.matches = function( expr, elements ) {
        return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
        return Sizzle( expr, null, null, [ elem ] ).length > 0;
};

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
        return function( elem ) {
                var name = elem.nodeName.toLowerCase();
                return name === "input" && elem.type === type;
        };
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
        return function( elem ) {
                var name = elem.nodeName.toLowerCase();
                return (name === "input" || name === "button") && elem.type === type;
        };
}

// Returns a function to use in pseudos for positionals
function createPositionalPseudo( fn ) {
        return markFunction(function( argument ) {
                argument = +argument;
                return markFunction(function( seed, matches ) {
                        var j,
                                matchIndexes = fn( [], seed.length, argument ),
                                i = matchIndexes.length;

                        // Match elements found at the specified indexes
                        while ( i-- ) {
                                if ( seed[ (j = matchIndexes[i]) ] ) {
                                        seed[j] = !(matches[j] = seed[j]);
                                }
                        }
                });
        });
}

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
        var node,
                ret = "",
                i = 0,
                nodeType = elem.nodeType;

        if ( nodeType ) {
                if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
                        // Use textContent for elements
                        // innerText usage removed for consistency of new lines (see #11153)
                        if ( typeof elem.textContent === "string" ) {
                                return elem.textContent;
                        } else {
                                // Traverse its children
                                for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
                                        ret += getText( elem );
                                }
                        }
                } else if ( nodeType === 3 || nodeType === 4 ) {
                        return elem.nodeValue;
                }
                // Do not include comment or processing instruction nodes
        } else {

                // If no nodeType, this is expected to be an array
                for ( ; (node = elem[i]); i++ ) {
                        // Do not traverse comment nodes
                        ret += getText( node );
                }
        }
        return ret;
};

isXML = Sizzle.isXML = function( elem ) {
        // documentElement is verified for cases where it doesn't yet exist
        // (such as loading iframes in IE - #4833)
        var documentElement = elem && (elem.ownerDocument || elem).documentElement;
        return documentElement ? documentElement.nodeName !== "HTML" : false;
};

// Element contains another
contains = Sizzle.contains = docElem.contains ?
        function( a, b ) {
                var adown = a.nodeType === 9 ? a.documentElement : a,
                        bup = b && b.parentNode;
                return a === bup || !!( bup && bup.nodeType === 1 && adown.contains && adown.contains(bup) );
        } :
        docElem.compareDocumentPosition ?
        function( a, b ) {
                return b && !!( a.compareDocumentPosition( b ) & 16 );
        } :
        function( a, b ) {
                while ( (b = b.parentNode) ) {
                        if ( b === a ) {
                                return true;
                        }
                }
                return false;
        };

Sizzle.attr = function( elem, name ) {
        var val,
                xml = isXML( elem );

        if ( !xml ) {
                name = name.toLowerCase();
        }
        if ( (val = Expr.attrHandle[ name ]) ) {
                return val( elem );
        }
        if ( xml || assertAttributes ) {
                return elem.getAttribute( name );
        }
        val = elem.getAttributeNode( name );
        return val ?
                typeof elem[ name ] === "boolean" ?
                        elem[ name ] ? name : null :
                        val.specified ? val.value : null :
                null;
};

Expr = Sizzle.selectors = {

        // Can be adjusted by the user
        cacheLength: 50,

        createPseudo: markFunction,

        match: matchExpr,

        // IE6/7 return a modified href
        attrHandle: assertHrefNotNormalized ?
                {} :
                {
                        "href": function( elem ) {
                                return elem.getAttribute( "href", 2 );
                        },
                        "type": function( elem ) {
                                return elem.getAttribute("type");
                        }
                },

        find: {
                "ID": assertGetIdNotName ?
                        function( id, context, xml ) {
                                if ( typeof context.getElementById !== strundefined && !xml ) {
                                        var m = context.getElementById( id );
                                        // Check parentNode to catch when Blackberry 4.6 returns
                                        // nodes that are no longer in the document #6963
                                        return m && m.parentNode ? [m] : [];
                                }
                        } :
                        function( id, context, xml ) {
                                if ( typeof context.getElementById !== strundefined && !xml ) {
                                        var m = context.getElementById( id );

                                        return m ?
                                                m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
                                                        [m] :
                                                        undefined :
                                                [];
                                }
                        },

                "TAG": assertTagNameNoComments ?
                        function( tag, context ) {
                                if ( typeof context.getElementsByTagName !== strundefined ) {
                                        return context.getElementsByTagName( tag );
                                }
                        } :
                        function( tag, context ) {
                                var results = context.getElementsByTagName( tag );

                                // Filter out possible comments
                                if ( tag === "*" ) {
                                        var elem,
                                                tmp = [],
                                                i = 0;

                                        for ( ; (elem = results[i]); i++ ) {
                                                if ( elem.nodeType === 1 ) {
                                                        tmp.push( elem );
                                                }
                                        }

                                        return tmp;
                                }
                                return results;
                        },

                "NAME": assertUsableName && function( tag, context ) {
                        if ( typeof context.getElementsByName !== strundefined ) {
                                return context.getElementsByName( name );
                        }
                },

                "CLASS": assertUsableClassName && function( className, context, xml ) {
                        if ( typeof context.getElementsByClassName !== strundefined && !xml ) {
                                return context.getElementsByClassName( className );
                        }
                }
        },

        relative: {
                ">": { dir: "parentNode", first: true },
                " ": { dir: "parentNode" },
                "+": { dir: "previousSibling", first: true },
                "~": { dir: "previousSibling" }
        },

        preFilter: {
                "ATTR": function( match ) {
                        match[1] = match[1].replace( rbackslash, "" );

                        // Move the given value to match[3] whether quoted or unquoted
                        match[3] = ( match[4] || match[5] || "" ).replace( rbackslash, "" );

                        if ( match[2] === "~=" ) {
                                match[3] = " " + match[3] + " ";
                        }

                        return match.slice( 0, 4 );
                },

                "CHILD": function( match ) {
                        /* matches from matchExpr["CHILD"]
                                1 type (only|nth|...)
                                2 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
                                3 xn-component of xn+y argument ([+-]?\d*n|)
                                4 sign of xn-component
                                5 x of xn-component
                                6 sign of y-component
                                7 y of y-component
                        */
                        match[1] = match[1].toLowerCase();

                        if ( match[1] === "nth" ) {
                                // nth-child requires argument
                                if ( !match[2] ) {
                                        Sizzle.error( match[0] );
                                }

                                // numeric x and y parameters for Expr.filter.CHILD
                                // remember that false/true cast respectively to 0/1
                                match[3] = +( match[3] ? match[4] + (match[5] || 1) : 2 * ( match[2] === "even" || match[2] === "odd" ) );
                                match[4] = +( ( match[6] + match[7] ) || match[2] === "odd" );

                        // other types prohibit arguments
                        } else if ( match[2] ) {
                                Sizzle.error( match[0] );
                        }

                        return match;
                },

                "PSEUDO": function( match ) {
                        var unquoted, excess;
                        if ( matchExpr["CHILD"].test( match[0] ) ) {
                                return null;
                        }

                        if ( match[3] ) {
                                match[2] = match[3];
                        } else if ( (unquoted = match[4]) ) {
                                // Only check arguments that contain a pseudo
                                if ( rpseudo.test(unquoted) &&
                                        // Get excess from tokenize (recursively)
                                        (excess = tokenize( unquoted, true )) &&
                                        // advance to the next closing parenthesis
                                        (excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

                                        // excess is a negative index
                                        unquoted = unquoted.slice( 0, excess );
                                        match[0] = match[0].slice( 0, excess );
                                }
                                match[2] = unquoted;
                        }

                        // Return only captures needed by the pseudo filter method (type and argument)
                        return match.slice( 0, 3 );
                }
        },

        filter: {
                "ID": assertGetIdNotName ?
                        function( id ) {
                                id = id.replace( rbackslash, "" );
                                return function( elem ) {
                                        return elem.getAttribute("id") === id;
                                };
                        } :
                        function( id ) {
                                id = id.replace( rbackslash, "" );
                                return function( elem ) {
                                        var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
                                        return node && node.value === id;
                                };
                        },

                "TAG": function( nodeName ) {
                        if ( nodeName === "*" ) {
                                return function() { return true; };
                        }
                        nodeName = nodeName.replace( rbackslash, "" ).toLowerCase();

                        return function( elem ) {
                                return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
                        };
                },

                "CLASS": function( className ) {
                        var pattern = classCache[ expando ][ className + " " ];

                        return pattern ||
                                (pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
                                classCache( className, function( elem ) {
                                        return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
                                });
                },

                "ATTR": function( name, operator, check ) {
                        return function( elem, context ) {
                                var result = Sizzle.attr( elem, name );

                                if ( result == null ) {
                                        return operator === "!=";
                                }
                                if ( !operator ) {
                                        return true;
                                }

                                result += "";

                                return operator === "=" ? result === check :
                                        operator === "!=" ? result !== check :
                                        operator === "^=" ? check && result.indexOf( check ) === 0 :
                                        operator === "*=" ? check && result.indexOf( check ) > -1 :
                                        operator === "$=" ? check && result.substr( result.length - check.length ) === check :
                                        operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
                                        operator === "|=" ? result === check || result.substr( 0, check.length + 1 ) === check + "-" :
                                        false;
                        };
                },

                "CHILD": function( type, argument, first, last ) {

                        if ( type === "nth" ) {
                                return function( elem ) {
                                        var node, diff,
                                                parent = elem.parentNode;

                                        if ( first === 1 && last === 0 ) {
                                                return true;
                                        }

                                        if ( parent ) {
                                                diff = 0;
                                                for ( node = parent.firstChild; node; node = node.nextSibling ) {
                                                        if ( node.nodeType === 1 ) {
                                                                diff++;
                                                                if ( elem === node ) {
                                                                        break;
                                                                }
                                                        }
                                                }
                                        }

                                        // Incorporate the offset (or cast to NaN), then check against cycle size
                                        diff -= last;
                                        return diff === first || ( diff % first === 0 && diff / first >= 0 );
                                };
                        }

                        return function( elem ) {
                                var node = elem;

                                switch ( type ) {
                                        case "only":
                                        case "first":
                                                while ( (node = node.previousSibling) ) {
                                                        if ( node.nodeType === 1 ) {
                                                                return false;
                                                        }
                                                }

                                                if ( type === "first" ) {
                                                        return true;
                                                }

                                                node = elem;

                                                /* falls through */
                                        case "last":
                                                while ( (node = node.nextSibling) ) {
                                                        if ( node.nodeType === 1 ) {
                                                                return false;
                                                        }
                                                }

                                                return true;
                                }
                        };
                },

                "PSEUDO": function( pseudo, argument ) {
                        // pseudo-class names are case-insensitive
                        // http://www.w3.org/TR/selectors/#pseudo-classes
                        // Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
                        // Remember that setFilters inherits from pseudos
                        var args,
                                fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
                                        Sizzle.error( "unsupported pseudo: " + pseudo );

                        // The user may use createPseudo to indicate that
                        // arguments are needed to create the filter function
                        // just as Sizzle does
                        if ( fn[ expando ] ) {
                                return fn( argument );
                        }

                        // But maintain support for old signatures
                        if ( fn.length > 1 ) {
                                args = [ pseudo, pseudo, "", argument ];
                                return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
                                        markFunction(function( seed, matches ) {
                                                var idx,
                                                        matched = fn( seed, argument ),
                                                        i = matched.length;
                                                while ( i-- ) {
                                                        idx = indexOf.call( seed, matched[i] );
                                                        seed[ idx ] = !( matches[ idx ] = matched[i] );
                                                }
                                        }) :
                                        function( elem ) {
                                                return fn( elem, 0, args );
                                        };
                        }

                        return fn;
                }
        },

        pseudos: {
                "not": markFunction(function( selector ) {
                        // Trim the selector passed to compile
                        // to avoid treating leading and trailing
                        // spaces as combinators
                        var input = [],
                                results = [],
                                matcher = compile( selector.replace( rtrim, "$1" ) );

                        return matcher[ expando ] ?
                                markFunction(function( seed, matches, context, xml ) {
                                        var elem,
                                                unmatched = matcher( seed, null, xml, [] ),
                                                i = seed.length;

                                        // Match elements unmatched by `matcher`
                                        while ( i-- ) {
                                                if ( (elem = unmatched[i]) ) {
                                                        seed[i] = !(matches[i] = elem);
                                                }
                                        }
                                }) :
                                function( elem, context, xml ) {
                                        input[0] = elem;
                                        matcher( input, null, xml, results );
                                        return !results.pop();
                                };
                }),

                "has": markFunction(function( selector ) {
                        return function( elem ) {
                                return Sizzle( selector, elem ).length > 0;
                        };
                }),

                "contains": markFunction(function( text ) {
                        return function( elem ) {
                                return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
                        };
                }),

                "enabled": function( elem ) {
                        return elem.disabled === false;
                },

                "disabled": function( elem ) {
                        return elem.disabled === true;
                },

                "checked": function( elem ) {
                        // In CSS3, :checked should return both checked and selected elements
                        // http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
                        var nodeName = elem.nodeName.toLowerCase();
                        return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
                },

                "selected": function( elem ) {
                        // Accessing this property makes selected-by-default
                        // options in Safari work properly
                        if ( elem.parentNode ) {
                                elem.parentNode.selectedIndex;
                        }

                        return elem.selected === true;
                },

                "parent": function( elem ) {
                        return !Expr.pseudos["empty"]( elem );
                },

                "empty": function( elem ) {
                        // http://www.w3.org/TR/selectors/#empty-pseudo
                        // :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
                        //   not comment, processing instructions, or others
                        // Thanks to Diego Perini for the nodeName shortcut
                        //   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
                        var nodeType;
                        elem = elem.firstChild;
                        while ( elem ) {
                                if ( elem.nodeName > "@" || (nodeType = elem.nodeType) === 3 || nodeType === 4 ) {
                                        return false;
                                }
                                elem = elem.nextSibling;
                        }
                        return true;
                },

                "header": function( elem ) {
                        return rheader.test( elem.nodeName );
                },

                "text": function( elem ) {
                        var type, attr;
                        // IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
                        // use getAttribute instead to test this case
                        return elem.nodeName.toLowerCase() === "input" &&
                                (type = elem.type) === "text" &&
                                ( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === type );
                },

                // Input types
                "radio": createInputPseudo("radio"),
                "checkbox": createInputPseudo("checkbox"),
                "file": createInputPseudo("file"),
                "password": createInputPseudo("password"),
                "image": createInputPseudo("image"),

                "submit": createButtonPseudo("submit"),
                "reset": createButtonPseudo("reset"),

                "button": function( elem ) {
                        var name = elem.nodeName.toLowerCase();
                        return name === "input" && elem.type === "button" || name === "button";
                },

                "input": function( elem ) {
                        return rinputs.test( elem.nodeName );
                },

                "focus": function( elem ) {
                        var doc = elem.ownerDocument;
                        return elem === doc.activeElement && (!doc.hasFocus || doc.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
                },

                "active": function( elem ) {
                        return elem === elem.ownerDocument.activeElement;
                },

                // Positional types
                "first": createPositionalPseudo(function() {
                        return [ 0 ];
                }),

                "last": createPositionalPseudo(function( matchIndexes, length ) {
                        return [ length - 1 ];
                }),

                "eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
                        return [ argument < 0 ? argument + length : argument ];
                }),

                "even": createPositionalPseudo(function( matchIndexes, length ) {
                        for ( var i = 0; i < length; i += 2 ) {
                                matchIndexes.push( i );
                        }
                        return matchIndexes;
                }),

                "odd": createPositionalPseudo(function( matchIndexes, length ) {
                        for ( var i = 1; i < length; i += 2 ) {
                                matchIndexes.push( i );
                        }
                        return matchIndexes;
                }),

                "lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
                        for ( var i = argument < 0 ? argument + length : argument; --i >= 0; ) {
                                matchIndexes.push( i );
                        }
                        return matchIndexes;
                }),

                "gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
                        for ( var i = argument < 0 ? argument + length : argument; ++i < length; ) {
                                matchIndexes.push( i );
                        }
                        return matchIndexes;
                })
        }
};

function siblingCheck( a, b, ret ) {
        if ( a === b ) {
                return ret;
        }

        var cur = a.nextSibling;

        while ( cur ) {
                if ( cur === b ) {
                        return -1;
                }

                cur = cur.nextSibling;
        }

        return 1;
}

sortOrder = docElem.compareDocumentPosition ?
        function( a, b ) {
                if ( a === b ) {
                        hasDuplicate = true;
                        return 0;
                }

                return ( !a.compareDocumentPosition || !b.compareDocumentPosition ?
                        a.compareDocumentPosition :
                        a.compareDocumentPosition(b) & 4
                ) ? -1 : 1;
        } :
        function( a, b ) {
                // The nodes are identical, we can exit early
                if ( a === b ) {
                        hasDuplicate = true;
                        return 0;

                // Fallback to using sourceIndex (in IE) if it's available on both nodes
                } else if ( a.sourceIndex && b.sourceIndex ) {
                        return a.sourceIndex - b.sourceIndex;
                }

                var al, bl,
                        ap = [],
                        bp = [],
                        aup = a.parentNode,
                        bup = b.parentNode,
                        cur = aup;

                // If the nodes are siblings (or identical) we can do a quick check
                if ( aup === bup ) {
                        return siblingCheck( a, b );

                // If no parents were found then the nodes are disconnected
                } else if ( !aup ) {
                        return -1;

                } else if ( !bup ) {
                        return 1;
                }

                // Otherwise they're somewhere else in the tree so we need
                // to build up a full list of the parentNodes for comparison
                while ( cur ) {
                        ap.unshift( cur );
                        cur = cur.parentNode;
                }

                cur = bup;

                while ( cur ) {
                        bp.unshift( cur );
                        cur = cur.parentNode;
                }

                al = ap.length;
                bl = bp.length;

                // Start walking down the tree looking for a discrepancy
                for ( var i = 0; i < al && i < bl; i++ ) {
                        if ( ap[i] !== bp[i] ) {
                                return siblingCheck( ap[i], bp[i] );
                        }
                }

                // We ended someplace up the tree so do a sibling check
                return i === al ?
                        siblingCheck( a, bp[i], -1 ) :
                        siblingCheck( ap[i], b, 1 );
        };

// Always assume the presence of duplicates if sort doesn't
// pass them to our comparison function (as in Google Chrome).
[0, 0].sort( sortOrder );
baseHasDuplicate = !hasDuplicate;

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
        var elem,
                duplicates = [],
                i = 1,
                j = 0;

        hasDuplicate = baseHasDuplicate;
        results.sort( sortOrder );

        if ( hasDuplicate ) {
                for ( ; (elem = results[i]); i++ ) {
                        if ( elem === results[ i - 1 ] ) {
                                j = duplicates.push( i );
                        }
                }
                while ( j-- ) {
                        results.splice( duplicates[ j ], 1 );
                }
        }

        return results;
};

Sizzle.error = function( msg ) {
        throw new Error( "Syntax error, unrecognized expression: " + msg );
};

function tokenize( selector, parseOnly ) {
        var matched, match, tokens, type,
                soFar, groups, preFilters,
                cached = tokenCache[ expando ][ selector + " " ];

        if ( cached ) {
                return parseOnly ? 0 : cached.slice( 0 );
        }

        soFar = selector;
        groups = [];
        preFilters = Expr.preFilter;

        while ( soFar ) {

                // Comma and first run
                if ( !matched || (match = rcomma.exec( soFar )) ) {
                        if ( match ) {
                                // Don't consume trailing commas as valid
                                soFar = soFar.slice( match[0].length ) || soFar;
                        }
                        groups.push( tokens = [] );
                }

                matched = false;

                // Combinators
                if ( (match = rcombinators.exec( soFar )) ) {
                        tokens.push( matched = new Token( match.shift() ) );
                        soFar = soFar.slice( matched.length );

                        // Cast descendant combinators to space
                        matched.type = match[0].replace( rtrim, " " );
                }

                // Filters
                for ( type in Expr.filter ) {
                        if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
                                (match = preFilters[ type ]( match ))) ) {

                                tokens.push( matched = new Token( match.shift() ) );
                                soFar = soFar.slice( matched.length );
                                matched.type = type;
                                matched.matches = match;
                        }
                }

                if ( !matched ) {
                        break;
                }
        }

        // Return the length of the invalid excess
        // if we're just parsing
        // Otherwise, throw an error or return tokens
        return parseOnly ?
                soFar.length :
                soFar ?
                        Sizzle.error( selector ) :
                        // Cache the tokens
                        tokenCache( selector, groups ).slice( 0 );
}

function addCombinator( matcher, combinator, base ) {
        var dir = combinator.dir,
                checkNonElements = base && combinator.dir === "parentNode",
                doneName = done++;

        return combinator.first ?
                // Check against closest ancestor/preceding element
                function( elem, context, xml ) {
                        while ( (elem = elem[ dir ]) ) {
                                if ( checkNonElements || elem.nodeType === 1  ) {
                                        return matcher( elem, context, xml );
                                }
                        }
                } :

                // Check against all ancestor/preceding elements
                function( elem, context, xml ) {
                        // We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
                        if ( !xml ) {
                                var cache,
                                        dirkey = dirruns + " " + doneName + " ",
                                        cachedkey = dirkey + cachedruns;
                                while ( (elem = elem[ dir ]) ) {
                                        if ( checkNonElements || elem.nodeType === 1 ) {
                                                if ( (cache = elem[ expando ]) === cachedkey ) {
                                                        return elem.sizset;
                                                } else if ( typeof cache === "string" && cache.indexOf(dirkey) === 0 ) {
                                                        if ( elem.sizset ) {
                                                                return elem;
                                                        }
                                                } else {
                                                        elem[ expando ] = cachedkey;
                                                        if ( matcher( elem, context, xml ) ) {
                                                                elem.sizset = true;
                                                                return elem;
                                                        }
                                                        elem.sizset = false;
                                                }
                                        }
                                }
                        } else {
                                while ( (elem = elem[ dir ]) ) {
                                        if ( checkNonElements || elem.nodeType === 1 ) {
                                                if ( matcher( elem, context, xml ) ) {
                                                        return elem;
                                                }
                                        }
                                }
                        }
                };
}

function elementMatcher( matchers ) {
        return matchers.length > 1 ?
                function( elem, context, xml ) {
                        var i = matchers.length;
                        while ( i-- ) {
                                if ( !matchers[i]( elem, context, xml ) ) {
                                        return false;
                                }
                        }
                        return true;
                } :
                matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
        var elem,
                newUnmatched = [],
                i = 0,
                len = unmatched.length,
                mapped = map != null;

        for ( ; i < len; i++ ) {
                if ( (elem = unmatched[i]) ) {
                        if ( !filter || filter( elem, context, xml ) ) {
                                newUnmatched.push( elem );
                                if ( mapped ) {
                                        map.push( i );
                                }
                        }
                }
        }

        return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
        if ( postFilter && !postFilter[ expando ] ) {
                postFilter = setMatcher( postFilter );
        }
        if ( postFinder && !postFinder[ expando ] ) {
                postFinder = setMatcher( postFinder, postSelector );
        }
        return markFunction(function( seed, results, context, xml ) {
                var temp, i, elem,
                        preMap = [],
                        postMap = [],
                        preexisting = results.length,

                        // Get initial elements from seed or context
                        elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

                        // Prefilter to get matcher input, preserving a map for seed-results synchronization
                        matcherIn = preFilter && ( seed || !selector ) ?
                                condense( elems, preMap, preFilter, context, xml ) :
                                elems,

                        matcherOut = matcher ?
                                // If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
                                postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

                                        // ...intermediate processing is necessary
                                        [] :

                                        // ...otherwise use results directly
                                        results :
                                matcherIn;

                // Find primary matches
                if ( matcher ) {
                        matcher( matcherIn, matcherOut, context, xml );
                }

                // Apply postFilter
                if ( postFilter ) {
                        temp = condense( matcherOut, postMap );
                        postFilter( temp, [], context, xml );

                        // Un-match failing elements by moving them back to matcherIn
                        i = temp.length;
                        while ( i-- ) {
                                if ( (elem = temp[i]) ) {
                                        matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
                                }
                        }
                }

                if ( seed ) {
                        if ( postFinder || preFilter ) {
                                if ( postFinder ) {
                                        // Get the final matcherOut by condensing this intermediate into postFinder contexts
                                        temp = [];
                                        i = matcherOut.length;
                                        while ( i-- ) {
                                                if ( (elem = matcherOut[i]) ) {
                                                        // Restore matcherIn since elem is not yet a final match
                                                        temp.push( (matcherIn[i] = elem) );
                                                }
                                        }
                                        postFinder( null, (matcherOut = []), temp, xml );
                                }

                                // Move matched elements from seed to results to keep them synchronized
                                i = matcherOut.length;
                                while ( i-- ) {
                                        if ( (elem = matcherOut[i]) &&
                                                (temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

                                                seed[temp] = !(results[temp] = elem);
                                        }
                                }
                        }

                // Add elements to results, through postFinder if defined
                } else {
                        matcherOut = condense(
                                matcherOut === results ?
                                        matcherOut.splice( preexisting, matcherOut.length ) :
                                        matcherOut
                        );
                        if ( postFinder ) {
                                postFinder( null, results, matcherOut, xml );
                        } else {
                                push.apply( results, matcherOut );
                        }
                }
        });
}

function matcherFromTokens( tokens ) {
        var checkContext, matcher, j,
                len = tokens.length,
                leadingRelative = Expr.relative[ tokens[0].type ],
                implicitRelative = leadingRelative || Expr.relative[" "],
                i = leadingRelative ? 1 : 0,

                // The foundational matcher ensures that elements are reachable from top-level context(s)
                matchContext = addCombinator( function( elem ) {
                        return elem === checkContext;
                }, implicitRelative, true ),
                matchAnyContext = addCombinator( function( elem ) {
                        return indexOf.call( checkContext, elem ) > -1;
                }, implicitRelative, true ),
                matchers = [ function( elem, context, xml ) {
                        return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
                                (checkContext = context).nodeType ?
                                        matchContext( elem, context, xml ) :
                                        matchAnyContext( elem, context, xml ) );
                } ];

        for ( ; i < len; i++ ) {
                if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
                        matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
                } else {
                        matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

                        // Return special upon seeing a positional matcher
                        if ( matcher[ expando ] ) {
                                // Find the next relative operator (if any) for proper handling
                                j = ++i;
                                for ( ; j < len; j++ ) {
                                        if ( Expr.relative[ tokens[j].type ] ) {
                                                break;
                                        }
                                }
                                return setMatcher(
                                        i > 1 && elementMatcher( matchers ),
                                        i > 1 && tokens.slice( 0, i - 1 ).join("").replace( rtrim, "$1" ),
                                        matcher,
                                        i < j && matcherFromTokens( tokens.slice( i, j ) ),
                                        j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
                                        j < len && tokens.join("")
                                );
                        }
                        matchers.push( matcher );
                }
        }

        return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
        var bySet = setMatchers.length > 0,
                byElement = elementMatchers.length > 0,
                superMatcher = function( seed, context, xml, results, expandContext ) {
                        var elem, j, matcher,
                                setMatched = [],
                                matchedCount = 0,
                                i = "0",
                                unmatched = seed && [],
                                outermost = expandContext != null,
                                contextBackup = outermostContext,
                                // We must always have either seed elements or context
                                elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
                                // Nested matchers should use non-integer dirruns
                                dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.E);

                        if ( outermost ) {
                                outermostContext = context !== document && context;
                                cachedruns = superMatcher.el;
                        }

                        // Add elements passing elementMatchers directly to results
                        for ( ; (elem = elems[i]) != null; i++ ) {
                                if ( byElement && elem ) {
                                        for ( j = 0; (matcher = elementMatchers[j]); j++ ) {
                                                if ( matcher( elem, context, xml ) ) {
                                                        results.push( elem );
                                                        break;
                                                }
                                        }
                                        if ( outermost ) {
                                                dirruns = dirrunsUnique;
                                                cachedruns = ++superMatcher.el;
                                        }
                                }

                                // Track unmatched elements for set filters
                                if ( bySet ) {
                                        // They will have gone through all possible matchers
                                        if ( (elem = !matcher && elem) ) {
                                                matchedCount--;
                                        }

                                        // Lengthen the array for every element, matched or not
                                        if ( seed ) {
                                                unmatched.push( elem );
                                        }
                                }
                        }

                        // Apply set filters to unmatched elements
                        matchedCount += i;
                        if ( bySet && i !== matchedCount ) {
                                for ( j = 0; (matcher = setMatchers[j]); j++ ) {
                                        matcher( unmatched, setMatched, context, xml );
                                }

                                if ( seed ) {
                                        // Reintegrate element matches to eliminate the need for sorting
                                        if ( matchedCount > 0 ) {
                                                while ( i-- ) {
                                                        if ( !(unmatched[i] || setMatched[i]) ) {
                                                                setMatched[i] = pop.call( results );
                                                        }
                                                }
                                        }

                                        // Discard index placeholder values to get only actual matches
                                        setMatched = condense( setMatched );
                                }

                                // Add matches to results
                                push.apply( results, setMatched );

                                // Seedless set matches succeeding multiple successful matchers stipulate sorting
                                if ( outermost && !seed && setMatched.length > 0 &&
                                        ( matchedCount + setMatchers.length ) > 1 ) {

                                        Sizzle.uniqueSort( results );
                                }
                        }

                        // Override manipulation of globals by nested matchers
                        if ( outermost ) {
                                dirruns = dirrunsUnique;
                                outermostContext = contextBackup;
                        }

                        return unmatched;
                };

        superMatcher.el = 0;
        return bySet ?
                markFunction( superMatcher ) :
                superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
        var i,
                setMatchers = [],
                elementMatchers = [],
                cached = compilerCache[ expando ][ selector + " " ];

        if ( !cached ) {
                // Generate a function of recursive functions that can be used to check each element
                if ( !group ) {
                        group = tokenize( selector );
                }
                i = group.length;
                while ( i-- ) {
                        cached = matcherFromTokens( group[i] );
                        if ( cached[ expando ] ) {
                                setMatchers.push( cached );
                        } else {
                                elementMatchers.push( cached );
                        }
                }

                // Cache the compiled function
                cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
        }
        return cached;
};

function multipleContexts( selector, contexts, results ) {
        var i = 0,
                len = contexts.length;
        for ( ; i < len; i++ ) {
                Sizzle( selector, contexts[i], results );
        }
        return results;
}

function select( selector, context, results, seed, xml ) {
        var i, tokens, token, type, find,
                match = tokenize( selector ),
                j = match.length;

        if ( !seed ) {
                // Try to minimize operations if there is only one group
                if ( match.length === 1 ) {

                        // Take a shortcut and set the context if the root selector is an ID
                        tokens = match[0] = match[0].slice( 0 );
                        if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
                                        context.nodeType === 9 && !xml &&
                                        Expr.relative[ tokens[1].type ] ) {

                                context = Expr.find["ID"]( token.matches[0].replace( rbackslash, "" ), context, xml )[0];
                                if ( !context ) {
                                        return results;
                                }

                                selector = selector.slice( tokens.shift().length );
                        }

                        // Fetch a seed set for right-to-left matching
                        for ( i = matchExpr["POS"].test( selector ) ? -1 : tokens.length - 1; i >= 0; i-- ) {
                                token = tokens[i];

                                // Abort if we hit a combinator
                                if ( Expr.relative[ (type = token.type) ] ) {
                                        break;
                                }
                                if ( (find = Expr.find[ type ]) ) {
                                        // Search, expanding context for leading sibling combinators
                                        if ( (seed = find(
                                                token.matches[0].replace( rbackslash, "" ),
                                                rsibling.test( tokens[0].type ) && context.parentNode || context,
                                                xml
                                        )) ) {

                                                // If seed is empty or no tokens remain, we can return early
                                                tokens.splice( i, 1 );
                                                selector = seed.length && tokens.join("");
                                                if ( !selector ) {
                                                        push.apply( results, slice.call( seed, 0 ) );
                                                        return results;
                                                }

                                                break;
                                        }
                                }
                        }
                }
        }

        // Compile and execute a filtering function
        // Provide `match` to avoid retokenization if we modified the selector above
        compile( selector, match )(
                seed,
                context,
                xml,
                results,
                rsibling.test( selector )
        );
        return results;
}

if ( document.querySelectorAll ) {
        (function() {
                var disconnectedMatch,
                        oldSelect = select,
                        rescape = /'|\\/g,
                        rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,

                        // qSa(:focus) reports false when true (Chrome 21), no need to also add to buggyMatches since matches checks buggyQSA
                        // A support test would require too much code (would include document ready)
                        rbuggyQSA = [ ":focus" ],

                        // matchesSelector(:active) reports false when true (IE9/Opera 11.5)
                        // A support test would require too much code (would include document ready)
                        // just skip matchesSelector for :active
                        rbuggyMatches = [ ":active" ],
                        matches = docElem.matchesSelector ||
                                docElem.mozMatchesSelector ||
                                docElem.webkitMatchesSelector ||
                                docElem.oMatchesSelector ||
                                docElem.msMatchesSelector;

                // Build QSA regex
                // Regex strategy adopted from Diego Perini
                assert(function( div ) {
                        // Select is set to empty string on purpose
                        // This is to test IE's treatment of not explictly
                        // setting a boolean content attribute,
                        // since its presence should be enough
                        // http://bugs.jquery.com/ticket/12359
                        div.innerHTML = "<select><option selected=''></option></select>";

                        // IE8 - Some boolean attributes are not treated correctly
                        if ( !div.querySelectorAll("[selected]").length ) {
                                rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
                        }

                        // Webkit/Opera - :checked should return selected option elements
                        // http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
                        // IE8 throws error here (do not put tests after this one)
                        if ( !div.querySelectorAll(":checked").length ) {
                                rbuggyQSA.push(":checked");
                        }
                });

                assert(function( div ) {

                        // Opera 10-12/IE9 - ^= $= *= and empty values
                        // Should not select anything
                        div.innerHTML = "<p test=''></p>";
                        if ( div.querySelectorAll("[test^='']").length ) {
                                rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
                        }

                        // FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
                        // IE8 throws error here (do not put tests after this one)
                        div.innerHTML = "<input type='hidden'/>";
                        if ( !div.querySelectorAll(":enabled").length ) {
                                rbuggyQSA.push(":enabled", ":disabled");
                        }
                });

                // rbuggyQSA always contains :focus, so no need for a length check
                rbuggyQSA = /* rbuggyQSA.length && */ new RegExp( rbuggyQSA.join("|") );

                select = function( selector, context, results, seed, xml ) {
                        // Only use querySelectorAll when not filtering,
                        // when this is not xml,
                        // and when no QSA bugs apply
                        if ( !seed && !xml && !rbuggyQSA.test( selector ) ) {
                                var groups, i,
                                        old = true,
                                        nid = expando,
                                        newContext = context,
                                        newSelector = context.nodeType === 9 && selector;

                                // qSA works strangely on Element-rooted queries
                                // We can work around this by specifying an extra ID on the root
                                // and working up from there (Thanks to Andrew Dupont for the technique)
                                // IE 8 doesn't work on object elements
                                if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
                                        groups = tokenize( selector );

                                        if ( (old = context.getAttribute("id")) ) {
                                                nid = old.replace( rescape, "\\$&" );
                                        } else {
                                                context.setAttribute( "id", nid );
                                        }
                                        nid = "[id='" + nid + "'] ";

                                        i = groups.length;
                                        while ( i-- ) {
                                                groups[i] = nid + groups[i].join("");
                                        }
                                        newContext = rsibling.test( selector ) && context.parentNode || context;
                                        newSelector = groups.join(",");
                                }

                                if ( newSelector ) {
                                        try {
                                                push.apply( results, slice.call( newContext.querySelectorAll(
                                                        newSelector
                                                ), 0 ) );
                                                return results;
                                        } catch(qsaError) {
                                        } finally {
                                                if ( !old ) {
                                                        context.removeAttribute("id");
                                                }
                                        }
                                }
                        }

                        return oldSelect( selector, context, results, seed, xml );
                };

                if ( matches ) {
                        assert(function( div ) {
                                // Check to see if it's possible to do matchesSelector
                                // on a disconnected node (IE 9)
                                disconnectedMatch = matches.call( div, "div" );

                                // This should fail with an exception
                                // Gecko does not error, returns false instead
                                try {
                                        matches.call( div, "[test!='']:sizzle" );
                                        rbuggyMatches.push( "!=", pseudos );
                                } catch ( e ) {}
                        });

                        // rbuggyMatches always contains :active and :focus, so no need for a length check
                        rbuggyMatches = /* rbuggyMatches.length && */ new RegExp( rbuggyMatches.join("|") );

                        Sizzle.matchesSelector = function( elem, expr ) {
                                // Make sure that attribute selectors are quoted
                                expr = expr.replace( rattributeQuotes, "='$1']" );

                                // rbuggyMatches always contains :active, so no need for an existence check
                                if ( !isXML( elem ) && !rbuggyMatches.test( expr ) && !rbuggyQSA.test( expr ) ) {
                                        try {
                                                var ret = matches.call( elem, expr );

                                                // IE 9's matchesSelector returns false on disconnected nodes
                                                if ( ret || disconnectedMatch ||
                                                                // As well, disconnected nodes are said to be in a document
                                                                // fragment in IE 9
                                                                elem.document && elem.document.nodeType !== 11 ) {
                                                        return ret;
                                                }
                                        } catch(e) {}
                                }

                                return Sizzle( expr, null, null, [ elem ] ).length > 0;
                        };
                }
        })();
}

// Deprecated
Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Back-compat
function setFilters() {}
Expr.filters = setFilters.prototype = Expr.pseudos;
Expr.setFilters = new setFilters();

// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
var runtil = /Until$/,
        rparentsprev = /^(?:parents|prev(?:Until|All))/,
        isSimple = /^.[^:#\[\.,]*$/,
        rneedsContext = jQuery.expr.match.needsContext,
        // methods guaranteed to produce a unique set when starting from a unique set
        guaranteedUnique = {
                children: true,
                contents: true,
                next: true,
                prev: true
        };

jQuery.fn.extend({
        find: function( selector ) {
                var i, l, length, n, r, ret,
                        self = this;

                if ( typeof selector !== "string" ) {
                        return jQuery( selector ).filter(function() {
                                for ( i = 0, l = self.length; i < l; i++ ) {
                                        if ( jQuery.contains( self[ i ], this ) ) {
                                                return true;
                                        }
                                }
                        });
                }

                ret = this.pushStack( "", "find", selector );

                for ( i = 0, l = this.length; i < l; i++ ) {
                        length = ret.length;
                        jQuery.find( selector, this[i], ret );

                        if ( i > 0 ) {
                                // Make sure that the results are unique
                                for ( n = length; n < ret.length; n++ ) {
                                        for ( r = 0; r < length; r++ ) {
                                                if ( ret[r] === ret[n] ) {
                                                        ret.splice(n--, 1);
                                                        break;
                                                }
                                        }
                                }
                        }
                }

                return ret;
        },

        has: function( target ) {
                var i,
                        targets = jQuery( target, this ),
                        len = targets.length;

                return this.filter(function() {
                        for ( i = 0; i < len; i++ ) {
                                if ( jQuery.contains( this, targets[i] ) ) {
                                        return true;
                                }
                        }
                });
        },

        not: function( selector ) {
                return this.pushStack( winnow(this, selector, false), "not", selector);
        },

        filter: function( selector ) {
                return this.pushStack( winnow(this, selector, true), "filter", selector );
        },

        is: function( selector ) {
                return !!selector && (
                        typeof selector === "string" ?
                                // If this is a positional/relative selector, check membership in the returned set
                                // so $("p:first").is("p:last") won't return true for a doc with two "p".
                                rneedsContext.test( selector ) ?
                                        jQuery( selector, this.context ).index( this[0] ) >= 0 :
                                        jQuery.filter( selector, this ).length > 0 :
                                this.filter( selector ).length > 0 );
        },

        closest: function( selectors, context ) {
                var cur,
                        i = 0,
                        l = this.length,
                        ret = [],
                        pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
                                jQuery( selectors, context || this.context ) :
                                0;

                for ( ; i < l; i++ ) {
                        cur = this[i];

                        while ( cur && cur.ownerDocument && cur !== context && cur.nodeType !== 11 ) {
                                if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
                                        ret.push( cur );
                                        break;
                                }
                                cur = cur.parentNode;
                        }
                }

                ret = ret.length > 1 ? jQuery.unique( ret ) : ret;

                return this.pushStack( ret, "closest", selectors );
        },

        // Determine the position of an element within
        // the matched set of elements
        index: function( elem ) {

                // No argument, return index in parent
                if ( !elem ) {
                        return ( this[0] && this[0].parentNode ) ? this.prevAll().length : -1;
                }

                // index in selector
                if ( typeof elem === "string" ) {
                        return jQuery.inArray( this[0], jQuery( elem ) );
                }

                // Locate the position of the desired element
                return jQuery.inArray(
                        // If it receives a jQuery object, the first element is used
                        elem.jquery ? elem[0] : elem, this );
        },

        add: function( selector, context ) {
                var set = typeof selector === "string" ?
                                jQuery( selector, context ) :
                                jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
                        all = jQuery.merge( this.get(), set );

                return this.pushStack( isDisconnected( set[0] ) || isDisconnected( all[0] ) ?
                        all :
                        jQuery.unique( all ) );
        },

        addBack: function( selector ) {
                return this.add( selector == null ?
                        this.prevObject : this.prevObject.filter(selector)
                );
        }
});

jQuery.fn.andSelf = jQuery.fn.addBack;

// A painfully simple check to see if an element is disconnected
// from a document (should be improved, where feasible).
function isDisconnected( node ) {
        return !node || !node.parentNode || node.parentNode.nodeType === 11;
}

function sibling( cur, dir ) {
        do {
                cur = cur[ dir ];
        } while ( cur && cur.nodeType !== 1 );

        return cur;
}

jQuery.each({
        parent: function( elem ) {
                var parent = elem.parentNode;
                return parent && parent.nodeType !== 11 ? parent : null;
        },
        parents: function( elem ) {
                return jQuery.dir( elem, "parentNode" );
        },
        parentsUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "parentNode", until );
        },
        next: function( elem ) {
                return sibling( elem, "nextSibling" );
        },
        prev: function( elem ) {
                return sibling( elem, "previousSibling" );
        },
        nextAll: function( elem ) {
                return jQuery.dir( elem, "nextSibling" );
        },
        prevAll: function( elem ) {
                return jQuery.dir( elem, "previousSibling" );
        },
        nextUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "nextSibling", until );
        },
        prevUntil: function( elem, i, until ) {
                return jQuery.dir( elem, "previousSibling", until );
        },
        siblings: function( elem ) {
                return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
        },
        children: function( elem ) {
                return jQuery.sibling( elem.firstChild );
        },
        contents: function( elem ) {
                return jQuery.nodeName( elem, "iframe" ) ?
                        elem.contentDocument || elem.contentWindow.document :
                        jQuery.merge( [], elem.childNodes );
        }
}, function( name, fn ) {
        jQuery.fn[ name ] = function( until, selector ) {
                var ret = jQuery.map( this, fn, until );

                if ( !runtil.test( name ) ) {
                        selector = until;
                }

                if ( selector && typeof selector === "string" ) {
                        ret = jQuery.filter( selector, ret );
                }

                ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

                if ( this.length > 1 && rparentsprev.test( name ) ) {
                        ret = ret.reverse();
                }

                return this.pushStack( ret, name, core_slice.call( arguments ).join(",") );
        };
});

jQuery.extend({
        filter: function( expr, elems, not ) {
                if ( not ) {
                        expr = ":not(" + expr + ")";
                }

                return elems.length === 1 ?
                        jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
                        jQuery.find.matches(expr, elems);
        },

        dir: function( elem, dir, until ) {
                var matched = [],
                        cur = elem[ dir ];

                while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
                        if ( cur.nodeType === 1 ) {
                                matched.push( cur );
                        }
                        cur = cur[dir];
                }
                return matched;
        },

        sibling: function( n, elem ) {
                var r = [];

                for ( ; n; n = n.nextSibling ) {
                        if ( n.nodeType === 1 && n !== elem ) {
                                r.push( n );
                        }
                }

                return r;
        }
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, keep ) {

        // Can't pass null or undefined to indexOf in Firefox 4
        // Set to 0 to skip string check
        qualifier = qualifier || 0;

        if ( jQuery.isFunction( qualifier ) ) {
                return jQuery.grep(elements, function( elem, i ) {
                        var retVal = !!qualifier.call( elem, i, elem );
                        return retVal === keep;
                });

        } else if ( qualifier.nodeType ) {
                return jQuery.grep(elements, function( elem, i ) {
                        return ( elem === qualifier ) === keep;
                });

        } else if ( typeof qualifier === "string" ) {
                var filtered = jQuery.grep(elements, function( elem ) {
                        return elem.nodeType === 1;
                });

                if ( isSimple.test( qualifier ) ) {
                        return jQuery.filter(qualifier, filtered, !keep);
                } else {
                        qualifier = jQuery.filter( qualifier, filtered );
                }
        }

        return jQuery.grep(elements, function( elem, i ) {
                return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
        });
}
function createSafeFragment( document ) {
        var list = nodeNames.split( "|" ),
        safeFrag = document.createDocumentFragment();

        if ( safeFrag.createElement ) {
                while ( list.length ) {
                        safeFrag.createElement(
                                list.pop()
                        );
                }
        }
        return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
                "header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
        rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
        rleadingWhitespace = /^\s+/,
        rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
        rtagName = /<([\w:]+)/,
        rtbody = /<tbody/i,
        rhtml = /<|&#?\w+;/,
        rnoInnerhtml = /<(?:script|style|link)/i,
        rnocache = /<(?:script|object|embed|option|style)/i,
        rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
        rcheckableType = /^(?:checkbox|radio)$/,
        // checked="checked" or checked
        rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
        rscriptType = /\/(java|ecma)script/i,
        rcleanScript = /^\s*<!(?:\[CDATA\[|\-\-)|[\]\-]{2}>\s*$/g,
        wrapMap = {
                option: [ 1, "<select multiple='multiple'>", "</select>" ],
                legend: [ 1, "<fieldset>", "</fieldset>" ],
                thead: [ 1, "<table>", "</table>" ],
                tr: [ 2, "<table><tbody>", "</tbody></table>" ],
                td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
                col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
                area: [ 1, "<map>", "</map>" ],
                _default: [ 0, "", "" ]
        },
        safeFragment = createSafeFragment( document ),
        fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
// unless wrapped in a div with non-breaking characters in front of it.
if ( !jQuery.support.htmlSerialize ) {
        wrapMap._default = [ 1, "X<div>", "</div>" ];
}

jQuery.fn.extend({
        text: function( value ) {
                return jQuery.access( this, function( value ) {
                        return value === undefined ?
                                jQuery.text( this ) :
                                this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
                }, null, value, arguments.length );
        },

        wrapAll: function( html ) {
                if ( jQuery.isFunction( html ) ) {
                        return this.each(function(i) {
                                jQuery(this).wrapAll( html.call(this, i) );
                        });
                }

                if ( this[0] ) {
                        // The elements to wrap the target around
                        var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

                        if ( this[0].parentNode ) {
                                wrap.insertBefore( this[0] );
                        }

                        wrap.map(function() {
                                var elem = this;

                                while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
                                        elem = elem.firstChild;
                                }

                                return elem;
                        }).append( this );
                }

                return this;
        },

        wrapInner: function( html ) {
                if ( jQuery.isFunction( html ) ) {
                        return this.each(function(i) {
                                jQuery(this).wrapInner( html.call(this, i) );
                        });
                }

                return this.each(function() {
                        var self = jQuery( this ),
                                contents = self.contents();

                        if ( contents.length ) {
                                contents.wrapAll( html );

                        } else {
                                self.append( html );
                        }
                });
        },

        wrap: function( html ) {
                var isFunction = jQuery.isFunction( html );

                return this.each(function(i) {
                        jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
                });
        },

        unwrap: function() {
                return this.parent().each(function() {
                        if ( !jQuery.nodeName( this, "body" ) ) {
                                jQuery( this ).replaceWith( this.childNodes );
                        }
                }).end();
        },

        append: function() {
                return this.domManip(arguments, true, function( elem ) {
                        if ( this.nodeType === 1 || this.nodeType === 11 ) {
                                this.appendChild( elem );
                        }
                });
        },

        prepend: function() {
                return this.domManip(arguments, true, function( elem ) {
                        if ( this.nodeType === 1 || this.nodeType === 11 ) {
                                this.insertBefore( elem, this.firstChild );
                        }
                });
        },

        before: function() {
                if ( !isDisconnected( this[0] ) ) {
                        return this.domManip(arguments, false, function( elem ) {
                                this.parentNode.insertBefore( elem, this );
                        });
                }

                if ( arguments.length ) {
                        var set = jQuery.clean( arguments );
                        return this.pushStack( jQuery.merge( set, this ), "before", this.selector );
                }
        },

        after: function() {
                if ( !isDisconnected( this[0] ) ) {
                        return this.domManip(arguments, false, function( elem ) {
                                this.parentNode.insertBefore( elem, this.nextSibling );
                        });
                }

                if ( arguments.length ) {
                        var set = jQuery.clean( arguments );
                        return this.pushStack( jQuery.merge( this, set ), "after", this.selector );
                }
        },

        // keepData is for internal use only--do not document
        remove: function( selector, keepData ) {
                var elem,
                        i = 0;

                for ( ; (elem = this[i]) != null; i++ ) {
                        if ( !selector || jQuery.filter( selector, [ elem ] ).length ) {
                                if ( !keepData && elem.nodeType === 1 ) {
                                        jQuery.cleanData( elem.getElementsByTagName("*") );
                                        jQuery.cleanData( [ elem ] );
                                }

                                if ( elem.parentNode ) {
                                        elem.parentNode.removeChild( elem );
                                }
                        }
                }

                return this;
        },

        empty: function() {
                var elem,
                        i = 0;

                for ( ; (elem = this[i]) != null; i++ ) {
                        // Remove element nodes and prevent memory leaks
                        if ( elem.nodeType === 1 ) {
                                jQuery.cleanData( elem.getElementsByTagName("*") );
                        }

                        // Remove any remaining nodes
                        while ( elem.firstChild ) {
                                elem.removeChild( elem.firstChild );
                        }
                }

                return this;
        },

        clone: function( dataAndEvents, deepDataAndEvents ) {
                dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
                deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

                return this.map( function () {
                        return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
                });
        },

        html: function( value ) {
                return jQuery.access( this, function( value ) {
                        var elem = this[0] || {},
                                i = 0,
                                l = this.length;

                        if ( value === undefined ) {
                                return elem.nodeType === 1 ?
                                        elem.innerHTML.replace( rinlinejQuery, "" ) :
                                        undefined;
                        }

                        // See if we can take a shortcut and just use innerHTML
                        if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
                                ( jQuery.support.htmlSerialize || !rnoshimcache.test( value )  ) &&
                                ( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
                                !wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

                                value = value.replace( rxhtmlTag, "<$1></$2>" );

                                try {
                                        for (; i < l; i++ ) {
                                                // Remove element nodes and prevent memory leaks
                                                elem = this[i] || {};
                                                if ( elem.nodeType === 1 ) {
                                                        jQuery.cleanData( elem.getElementsByTagName( "*" ) );
                                                        elem.innerHTML = value;
                                                }
                                        }

                                        elem = 0;

                                // If using innerHTML throws an exception, use the fallback method
                                } catch(e) {}
                        }

                        if ( elem ) {
                                this.empty().append( value );
                        }
                }, null, value, arguments.length );
        },

        replaceWith: function( value ) {
                if ( !isDisconnected( this[0] ) ) {
                        // Make sure that the elements are removed from the DOM before they are inserted
                        // this can help fix replacing a parent with child elements
                        if ( jQuery.isFunction( value ) ) {
                                return this.each(function(i) {
                                        var self = jQuery(this), old = self.html();
                                        self.replaceWith( value.call( this, i, old ) );
                                });
                        }

                        if ( typeof value !== "string" ) {
                                value = jQuery( value ).detach();
                        }

                        return this.each(function() {
                                var next = this.nextSibling,
                                        parent = this.parentNode;

                                jQuery( this ).remove();

                                if ( next ) {
                                        jQuery(next).before( value );
                                } else {
                                        jQuery(parent).append( value );
                                }
                        });
                }

                return this.length ?
                        this.pushStack( jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value ) :
                        this;
        },

        detach: function( selector ) {
                return this.remove( selector, true );
        },

        domManip: function( args, table, callback ) {

                // Flatten any nested arrays
                args = [].concat.apply( [], args );

                var results, first, fragment, iNoClone,
                        i = 0,
                        value = args[0],
                        scripts = [],
                        l = this.length;

                // We can't cloneNode fragments that contain checked, in WebKit
                if ( !jQuery.support.checkClone && l > 1 && typeof value === "string" && rchecked.test( value ) ) {
                        return this.each(function() {
                                jQuery(this).domManip( args, table, callback );
                        });
                }

                if ( jQuery.isFunction(value) ) {
                        return this.each(function(i) {
                                var self = jQuery(this);
                                args[0] = value.call( this, i, table ? self.html() : undefined );
                                self.domManip( args, table, callback );
                        });
                }

                if ( this[0] ) {
                        results = jQuery.buildFragment( args, this, scripts );
                        fragment = results.fragment;
                        first = fragment.firstChild;

                        if ( fragment.childNodes.length === 1 ) {
                                fragment = first;
                        }

                        if ( first ) {
                                table = table && jQuery.nodeName( first, "tr" );

                                // Use the original fragment for the last item instead of the first because it can end up
                                // being emptied incorrectly in certain situations (#8070).
                                // Fragments from the fragment cache must always be cloned and never used in place.
                                for ( iNoClone = results.cacheable || l - 1; i < l; i++ ) {
                                        callback.call(
                                                table && jQuery.nodeName( this[i], "table" ) ?
                                                        findOrAppend( this[i], "tbody" ) :
                                                        this[i],
                                                i === iNoClone ?
                                                        fragment :
                                                        jQuery.clone( fragment, true, true )
                                        );
                                }
                        }

                        // Fix #11809: Avoid leaking memory
                        fragment = first = null;

                        if ( scripts.length ) {
                                jQuery.each( scripts, function( i, elem ) {
                                        if ( elem.src ) {
                                                if ( jQuery.ajax ) {
                                                        jQuery.ajax({
                                                                url: elem.src,
                                                                type: "GET",
                                                                dataType: "script",
                                                                async: false,
                                                                global: false,
                                                                "throws": true
                                                        });
                                                } else {
                                                        jQuery.error("no ajax");
                                                }
                                        } else {
                                                jQuery.globalEval( ( elem.text || elem.textContent || elem.innerHTML || "" ).replace( rcleanScript, "" ) );
                                        }

                                        if ( elem.parentNode ) {
                                                elem.parentNode.removeChild( elem );
                                        }
                                });
                        }
                }

                return this;
        }
});

function findOrAppend( elem, tag ) {
        return elem.getElementsByTagName( tag )[0] || elem.appendChild( elem.ownerDocument.createElement( tag ) );
}

function cloneCopyEvent( src, dest ) {

        if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
                return;
        }

        var type, i, l,
                oldData = jQuery._data( src ),
                curData = jQuery._data( dest, oldData ),
                events = oldData.events;

        if ( events ) {
                delete curData.handle;
                curData.events = {};

                for ( type in events ) {
                        for ( i = 0, l = events[ type ].length; i < l; i++ ) {
                                jQuery.event.add( dest, type, events[ type ][ i ] );
                        }
                }
        }

        // make the cloned public data object a copy from the original
        if ( curData.data ) {
                curData.data = jQuery.extend( {}, curData.data );
        }
}

function cloneFixAttributes( src, dest ) {
        var nodeName;

        // We do not need to do anything for non-Elements
        if ( dest.nodeType !== 1 ) {
                return;
        }

        // clearAttributes removes the attributes, which we don't want,
        // but also removes the attachEvent events, which we *do* want
        if ( dest.clearAttributes ) {
                dest.clearAttributes();
        }

        // mergeAttributes, in contrast, only merges back on the
        // original attributes, not the events
        if ( dest.mergeAttributes ) {
                dest.mergeAttributes( src );
        }

        nodeName = dest.nodeName.toLowerCase();

        if ( nodeName === "object" ) {
                // IE6-10 improperly clones children of object elements using classid.
                // IE10 throws NoModificationAllowedError if parent is null, #12132.
                if ( dest.parentNode ) {
                        dest.outerHTML = src.outerHTML;
                }

                // This path appears unavoidable for IE9. When cloning an object
                // element in IE9, the outerHTML strategy above is not sufficient.
                // If the src has innerHTML and the destination does not,
                // copy the src.innerHTML into the dest.innerHTML. #10324
                if ( jQuery.support.html5Clone && (src.innerHTML && !jQuery.trim(dest.innerHTML)) ) {
                        dest.innerHTML = src.innerHTML;
                }

        } else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
                // IE6-8 fails to persist the checked state of a cloned checkbox
                // or radio button. Worse, IE6-7 fail to give the cloned element
                // a checked appearance if the defaultChecked value isn't also set

                dest.defaultChecked = dest.checked = src.checked;

                // IE6-7 get confused and end up setting the value of a cloned
                // checkbox/radio button to an empty string instead of "on"
                if ( dest.value !== src.value ) {
                        dest.value = src.value;
                }

        // IE6-8 fails to return the selected option to the default selected
        // state when cloning options
        } else if ( nodeName === "option" ) {
                dest.selected = src.defaultSelected;

        // IE6-8 fails to set the defaultValue to the correct value when
        // cloning other types of input fields
        } else if ( nodeName === "input" || nodeName === "textarea" ) {
                dest.defaultValue = src.defaultValue;

        // IE blanks contents when cloning scripts
        } else if ( nodeName === "script" && dest.text !== src.text ) {
                dest.text = src.text;
        }

        // Event data gets referenced instead of copied if the expando
        // gets copied too
        dest.removeAttribute( jQuery.expando );
}

jQuery.buildFragment = function( args, context, scripts ) {
        var fragment, cacheable, cachehit,
                first = args[ 0 ];

        // Set context from what may come in as undefined or a jQuery collection or a node
        // Updated to fix #12266 where accessing context[0] could throw an exception in IE9/10 &
        // also doubles as fix for #8950 where plain objects caused createDocumentFragment exception
        context = context || document;
        context = !context.nodeType && context[0] || context;
        context = context.ownerDocument || context;

        // Only cache "small" (1/2 KB) HTML strings that are associated with the main document
        // Cloning options loses the selected state, so don't cache them
        // IE 6 doesn't like it when you put <object> or <embed> elements in a fragment
        // Also, WebKit does not clone 'checked' attributes on cloneNode, so don't cache
        // Lastly, IE6,7,8 will not correctly reuse cached fragments that were created from unknown elems #10501
        if ( args.length === 1 && typeof first === "string" && first.length < 512 && context === document &&
                first.charAt(0) === "<" && !rnocache.test( first ) &&
                (jQuery.support.checkClone || !rchecked.test( first )) &&
                (jQuery.support.html5Clone || !rnoshimcache.test( first )) ) {

                // Mark cacheable and look for a hit
                cacheable = true;
                fragment = jQuery.fragments[ first ];
                cachehit = fragment !== undefined;
        }

        if ( !fragment ) {
                fragment = context.createDocumentFragment();
                jQuery.clean( args, context, fragment, scripts );

                // Update the cache, but only store false
                // unless this is a second parsing of the same content
                if ( cacheable ) {
                        jQuery.fragments[ first ] = cachehit && fragment;
                }
        }

        return { fragment: fragment, cacheable: cacheable };
};

jQuery.fragments = {};

jQuery.each({
        appendTo: "append",
        prependTo: "prepend",
        insertBefore: "before",
        insertAfter: "after",
        replaceAll: "replaceWith"
}, function( name, original ) {
        jQuery.fn[ name ] = function( selector ) {
                var elems,
                        i = 0,
                        ret = [],
                        insert = jQuery( selector ),
                        l = insert.length,
                        parent = this.length === 1 && this[0].parentNode;

                if ( (parent == null || parent && parent.nodeType === 11 && parent.childNodes.length === 1) && l === 1 ) {
                        insert[ original ]( this[0] );
                        return this;
                } else {
                        for ( ; i < l; i++ ) {
                                elems = ( i > 0 ? this.clone(true) : this ).get();
                                jQuery( insert[i] )[ original ]( elems );
                                ret = ret.concat( elems );
                        }

                        return this.pushStack( ret, name, insert.selector );
                }
        };
});

function getAll( elem ) {
        if ( typeof elem.getElementsByTagName !== "undefined" ) {
                return elem.getElementsByTagName( "*" );

        } else if ( typeof elem.querySelectorAll !== "undefined" ) {
                return elem.querySelectorAll( "*" );

        } else {
                return [];
        }
}

// Used in clean, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
        if ( rcheckableType.test( elem.type ) ) {
                elem.defaultChecked = elem.checked;
        }
}

jQuery.extend({
        clone: function( elem, dataAndEvents, deepDataAndEvents ) {
                var srcElements,
                        destElements,
                        i,
                        clone;

                if ( jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
                        clone = elem.cloneNode( true );

                // IE<=8 does not properly clone detached, unknown element nodes
                } else {
                        fragmentDiv.innerHTML = elem.outerHTML;
                        fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
                }

                if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
                                (elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
                        // IE copies events bound via attachEvent when using cloneNode.
                        // Calling detachEvent on the clone will also remove the events
                        // from the original. In order to get around this, we use some
                        // proprietary methods to clear the events. Thanks to MooTools
                        // guys for this hotness.

                        cloneFixAttributes( elem, clone );

                        // Using Sizzle here is crazy slow, so we use getElementsByTagName instead
                        srcElements = getAll( elem );
                        destElements = getAll( clone );

                        // Weird iteration because IE will replace the length property
                        // with an element if you are cloning the body and one of the
                        // elements on the page has a name or id of "length"
                        for ( i = 0; srcElements[i]; ++i ) {
                                // Ensure that the destination node is not null; Fixes #9587
                                if ( destElements[i] ) {
                                        cloneFixAttributes( srcElements[i], destElements[i] );
                                }
                        }
                }

                // Copy the events from the original to the clone
                if ( dataAndEvents ) {
                        cloneCopyEvent( elem, clone );

                        if ( deepDataAndEvents ) {
                                srcElements = getAll( elem );
                                destElements = getAll( clone );

                                for ( i = 0; srcElements[i]; ++i ) {
                                        cloneCopyEvent( srcElements[i], destElements[i] );
                                }
                        }
                }

                srcElements = destElements = null;

                // Return the cloned set
                return clone;
        },

        clean: function( elems, context, fragment, scripts ) {
                var i, j, elem, tag, wrap, depth, div, hasBody, tbody, len, handleScript, jsTags,
                        safe = context === document && safeFragment,
                        ret = [];

                // Ensure that context is a document
                if ( !context || typeof context.createDocumentFragment === "undefined" ) {
                        context = document;
                }

                // Use the already-created safe fragment if context permits
                for ( i = 0; (elem = elems[i]) != null; i++ ) {
                        if ( typeof elem === "number" ) {
                                elem += "";
                        }

                        if ( !elem ) {
                                continue;
                        }

                        // Convert html string into DOM nodes
                        if ( typeof elem === "string" ) {
                                if ( !rhtml.test( elem ) ) {
                                        elem = context.createTextNode( elem );
                                } else {
                                        // Ensure a safe container in which to render the html
                                        safe = safe || createSafeFragment( context );
                                        div = context.createElement("div");
                                        safe.appendChild( div );

                                        // Fix "XHTML"-style tags in all browsers
                                        elem = elem.replace(rxhtmlTag, "<$1></$2>");

                                        // Go to html and back, then peel off extra wrappers
                                        tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase();
                                        wrap = wrapMap[ tag ] || wrapMap._default;
                                        depth = wrap[0];
                                        div.innerHTML = wrap[1] + elem + wrap[2];

                                        // Move to the right depth
                                        while ( depth-- ) {
                                                div = div.lastChild;
                                        }

                                        // Remove IE's autoinserted <tbody> from table fragments
                                        if ( !jQuery.support.tbody ) {

                                                // String was a <table>, *may* have spurious <tbody>
                                                hasBody = rtbody.test(elem);
                                                        tbody = tag === "table" && !hasBody ?
                                                                div.firstChild && div.firstChild.childNodes :

                                                                // String was a bare <thead> or <tfoot>
                                                                wrap[1] === "<table>" && !hasBody ?
                                                                        div.childNodes :
                                                                        [];

                                                for ( j = tbody.length - 1; j >= 0 ; --j ) {
                                                        if ( jQuery.nodeName( tbody[ j ], "tbody" ) && !tbody[ j ].childNodes.length ) {
                                                                tbody[ j ].parentNode.removeChild( tbody[ j ] );
                                                        }
                                                }
                                        }

                                        // IE completely kills leading whitespace when innerHTML is used
                                        if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
                                                div.insertBefore( context.createTextNode( rleadingWhitespace.exec(elem)[0] ), div.firstChild );
                                        }

                                        elem = div.childNodes;

                                        // Take out of fragment container (we need a fresh div each time)
                                        div.parentNode.removeChild( div );
                                }
                        }

                        if ( elem.nodeType ) {
                                ret.push( elem );
                        } else {
                                jQuery.merge( ret, elem );
                        }
                }

                // Fix #11356: Clear elements from safeFragment
                if ( div ) {
                        elem = div = safe = null;
                }

                // Reset defaultChecked for any radios and checkboxes
                // about to be appended to the DOM in IE 6/7 (#8060)
                if ( !jQuery.support.appendChecked ) {
                        for ( i = 0; (elem = ret[i]) != null; i++ ) {
                                if ( jQuery.nodeName( elem, "input" ) ) {
                                        fixDefaultChecked( elem );
                                } else if ( typeof elem.getElementsByTagName !== "undefined" ) {
                                        jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
                                }
                        }
                }

                // Append elements to a provided document fragment
                if ( fragment ) {
                        // Special handling of each script element
                        handleScript = function( elem ) {
                                // Check if we consider it executable
                                if ( !elem.type || rscriptType.test( elem.type ) ) {
                                        // Detach the script and store it in the scripts array (if provided) or the fragment
                                        // Return truthy to indicate that it has been handled
                                        return scripts ?
                                                scripts.push( elem.parentNode ? elem.parentNode.removeChild( elem ) : elem ) :
                                                fragment.appendChild( elem );
                                }
                        };

                        for ( i = 0; (elem = ret[i]) != null; i++ ) {
                                // Check if we're done after handling an executable script
                                if ( !( jQuery.nodeName( elem, "script" ) && handleScript( elem ) ) ) {
                                        // Append to fragment and handle embedded scripts
                                        fragment.appendChild( elem );
                                        if ( typeof elem.getElementsByTagName !== "undefined" ) {
                                                // handleScript alters the DOM, so use jQuery.merge to ensure snapshot iteration
                                                jsTags = jQuery.grep( jQuery.merge( [], elem.getElementsByTagName("script") ), handleScript );

                                                // Splice the scripts into ret after their former ancestor and advance our index beyond them
                                                ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
                                                i += jsTags.length;
                                        }
                                }
                        }
                }

                return ret;
        },

        cleanData: function( elems, /* internal */ acceptData ) {
                var data, id, elem, type,
                        i = 0,
                        internalKey = jQuery.expando,
                        cache = jQuery.cache,
                        deleteExpando = jQuery.support.deleteExpando,
                        special = jQuery.event.special;

                for ( ; (elem = elems[i]) != null; i++ ) {

                        if ( acceptData || jQuery.acceptData( elem ) ) {

                                id = elem[ internalKey ];
                                data = id && cache[ id ];

                                if ( data ) {
                                        if ( data.events ) {
                                                for ( type in data.events ) {
                                                        if ( special[ type ] ) {
                                                                jQuery.event.remove( elem, type );

                                                        // This is a shortcut to avoid jQuery.event.remove's overhead
                                                        } else {
                                                                jQuery.removeEvent( elem, type, data.handle );
                                                        }
                                                }
                                        }

                                        // Remove cache only if it was not already removed by jQuery.event.remove
                                        if ( cache[ id ] ) {

                                                delete cache[ id ];

                                                // IE does not allow us to delete expando properties from nodes,
                                                // nor does it have a removeAttribute function on Document nodes;
                                                // we must handle all of these cases
                                                if ( deleteExpando ) {
                                                        delete elem[ internalKey ];

                                                } else if ( elem.removeAttribute ) {
                                                        elem.removeAttribute( internalKey );

                                                } else {
                                                        elem[ internalKey ] = null;
                                                }

                                                jQuery.deletedIds.push( id );
                                        }
                                }
                        }
                }
        }
});
// Limit scope pollution from any deprecated API
(function() {

var matched, browser;

// Use of jQuery.browser is frowned upon.
// More details: http://api.jquery.com/jQuery.browser
// jQuery.uaMatch maintained for back-compat
jQuery.uaMatch = function( ua ) {
        ua = ua.toLowerCase();

        var match = /(chrome)[ \/]([\w.]+)/.exec( ua ) ||
                /(webkit)[ \/]([\w.]+)/.exec( ua ) ||
                /(opera)(?:.*version|)[ \/]([\w.]+)/.exec( ua ) ||
                /(msie) ([\w.]+)/.exec( ua ) ||
                ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec( ua ) ||
                [];

        return {
                browser: match[ 1 ] || "",
                version: match[ 2 ] || "0"
        };
};

matched = jQuery.uaMatch( navigator.userAgent );
browser = {};

if ( matched.browser ) {
        browser[ matched.browser ] = true;
        browser.version = matched.version;
}

// Chrome is Webkit, but Webkit is also Safari.
if ( browser.chrome ) {
        browser.webkit = true;
} else if ( browser.webkit ) {
        browser.safari = true;
}

jQuery.browser = browser;

jQuery.sub = function() {
        function jQuerySub( selector, context ) {
                return new jQuerySub.fn.init( selector, context );
        }
        jQuery.extend( true, jQuerySub, this );
        jQuerySub.superclass = this;
        jQuerySub.fn = jQuerySub.prototype = this();
        jQuerySub.fn.constructor = jQuerySub;
        jQuerySub.sub = this.sub;
        jQuerySub.fn.init = function init( selector, context ) {
                if ( context && context instanceof jQuery && !(context instanceof jQuerySub) ) {
                        context = jQuerySub( context );
                }

                return jQuery.fn.init.call( this, selector, context, rootjQuerySub );
        };
        jQuerySub.fn.init.prototype = jQuerySub.fn;
        var rootjQuerySub = jQuerySub(document);
        return jQuerySub;
};

})();
var curCSS, iframe, iframeDoc,
        ralpha = /alpha\([^)]*\)/i,
        ropacity = /opacity=([^)]*)/,
        rposition = /^(top|right|bottom|left)$/,
        // swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
        // see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
        rdisplayswap = /^(none|table(?!-c[ea]).+)/,
        rmargin = /^margin/,
        rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
        rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
        rrelNum = new RegExp( "^([-+])=(" + core_pnum + ")", "i" ),
        elemdisplay = { BODY: "block" },

        cssShow = { position: "absolute", visibility: "hidden", display: "block" },
        cssNormalTransform = {
                letterSpacing: 0,
                fontWeight: 400
        },

        cssExpand = [ "Top", "Right", "Bottom", "Left" ],
        cssPrefixes = [ "Webkit", "O", "Moz", "ms" ],

        eventsToggle = jQuery.fn.toggle;

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

        // shortcut for names that are not vendor prefixed
        if ( name in style ) {
                return name;
        }

        // check for vendor prefixed names
        var capName = name.charAt(0).toUpperCase() + name.slice(1),
                origName = name,
                i = cssPrefixes.length;

        while ( i-- ) {
                name = cssPrefixes[ i ] + capName;
                if ( name in style ) {
                        return name;
                }
        }

        return origName;
}

function isHidden( elem, el ) {
        elem = el || elem;
        return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

function showHide( elements, show ) {
        var elem, display,
                values = [],
                index = 0,
                length = elements.length;

        for ( ; index < length; index++ ) {
                elem = elements[ index ];
                if ( !elem.style ) {
                        continue;
                }
                values[ index ] = jQuery._data( elem, "olddisplay" );
                if ( show ) {
                        // Reset the inline display of this element to learn if it is
                        // being hidden by cascaded rules or not
                        if ( !values[ index ] && elem.style.display === "none" ) {
                                elem.style.display = "";
                        }

                        // Set elements which have been overridden with display: none
                        // in a stylesheet to whatever the default browser style is
                        // for such an element
                        if ( elem.style.display === "" && isHidden( elem ) ) {
                                values[ index ] = jQuery._data( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
                        }
                } else {
                        display = curCSS( elem, "display" );

                        if ( !values[ index ] && display !== "none" ) {
                                jQuery._data( elem, "olddisplay", display );
                        }
                }
        }

        // Set the display of most of the elements in a second loop
        // to avoid the constant reflow
        for ( index = 0; index < length; index++ ) {
                elem = elements[ index ];
                if ( !elem.style ) {
                        continue;
                }
                if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
                        elem.style.display = show ? values[ index ] || "" : "none";
                }
        }

        return elements;
}

jQuery.fn.extend({
        css: function( name, value ) {
                return jQuery.access( this, function( elem, name, value ) {
                        return value !== undefined ?
                                jQuery.style( elem, name, value ) :
                                jQuery.css( elem, name );
                }, name, value, arguments.length > 1 );
        },
        show: function() {
                return showHide( this, true );
        },
        hide: function() {
                return showHide( this );
        },
        toggle: function( state, fn2 ) {
                var bool = typeof state === "boolean";

                if ( jQuery.isFunction( state ) && jQuery.isFunction( fn2 ) ) {
                        return eventsToggle.apply( this, arguments );
                }

                return this.each(function() {
                        if ( bool ? state : isHidden( this ) ) {
                                jQuery( this ).show();
                        } else {
                                jQuery( this ).hide();
                        }
                });
        }
});

jQuery.extend({
        // Add in style property hooks for overriding the default
        // behavior of getting and setting a style property
        cssHooks: {
                opacity: {
                        get: function( elem, computed ) {
                                if ( computed ) {
                                        // We should always get a number back from opacity
                                        var ret = curCSS( elem, "opacity" );
                                        return ret === "" ? "1" : ret;

                                }
                        }
                }
        },

        // Exclude the following css properties to add px
        cssNumber: {
                "fillOpacity": true,
                "fontWeight": true,
                "lineHeight": true,
                "opacity": true,
                "orphans": true,
                "widows": true,
                "zIndex": true,
                "zoom": true
        },

        // Add in properties whose names you wish to fix before
        // setting or getting the value
        cssProps: {
                // normalize float css property
                "float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
        },

        // Get and set the style property on a DOM Node
        style: function( elem, name, value, extra ) {
                // Don't set styles on text and comment nodes
                if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
                        return;
                }

                // Make sure that we're working with the right name
                var ret, type, hooks,
                        origName = jQuery.camelCase( name ),
                        style = elem.style;

                name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

                // gets hook for the prefixed version
                // followed by the unprefixed version
                hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

                // Check if we're setting a value
                if ( value !== undefined ) {
                        type = typeof value;

                        // convert relative number strings (+= or -=) to relative numbers. #7345
                        if ( type === "string" && (ret = rrelNum.exec( value )) ) {
                                value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
                                // Fixes bug #9237
                                type = "number";
                        }

                        // Make sure that NaN and null values aren't set. See: #7116
                        if ( value == null || type === "number" && isNaN( value ) ) {
                                return;
                        }

                        // If a number was passed in, add 'px' to the (except for certain CSS properties)
                        if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
                                value += "px";
                        }

                        // If a hook was provided, use that value, otherwise just set the specified value
                        if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
                                // Wrapped to prevent IE from throwing errors when 'invalid' values are provided
                                // Fixes bug #5509
                                try {
                                        style[ name ] = value;
                                } catch(e) {}
                        }

                } else {
                        // If a hook was provided get the non-computed value from there
                        if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
                                return ret;
                        }

                        // Otherwise just get the value from the style object
                        return style[ name ];
                }
        },

        css: function( elem, name, numeric, extra ) {
                var val, num, hooks,
                        origName = jQuery.camelCase( name );

                // Make sure that we're working with the right name
                name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

                // gets hook for the prefixed version
                // followed by the unprefixed version
                hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

                // If a hook was provided get the computed value from there
                if ( hooks && "get" in hooks ) {
                        val = hooks.get( elem, true, extra );
                }

                // Otherwise, if a way to get the computed value exists, use that
                if ( val === undefined ) {
                        val = curCSS( elem, name );
                }

                //convert "normal" to computed value
                if ( val === "normal" && name in cssNormalTransform ) {
                        val = cssNormalTransform[ name ];
                }

                // Return, converting to number if forced or a qualifier was provided and val looks numeric
                if ( numeric || extra !== undefined ) {
                        num = parseFloat( val );
                        return numeric || jQuery.isNumeric( num ) ? num || 0 : val;
                }
                return val;
        },

        // A method for quickly swapping in/out CSS properties to get correct calculations
        swap: function( elem, options, callback ) {
                var ret, name,
                        old = {};

                // Remember the old values, and insert the new ones
                for ( name in options ) {
                        old[ name ] = elem.style[ name ];
                        elem.style[ name ] = options[ name ];
                }

                ret = callback.call( elem );

                // Revert the old values
                for ( name in options ) {
                        elem.style[ name ] = old[ name ];
                }

                return ret;
        }
});

// NOTE: To any future maintainer, we've window.getComputedStyle
// because jsdom on node.js will break without it.
if ( window.getComputedStyle ) {
        curCSS = function( elem, name ) {
                var ret, width, minWidth, maxWidth,
                        computed = window.getComputedStyle( elem, null ),
                        style = elem.style;

                if ( computed ) {

                        // getPropertyValue is only needed for .css('filter') in IE9, see #12537
                        ret = computed.getPropertyValue( name ) || computed[ name ];

                        if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
                                ret = jQuery.style( elem, name );
                        }

                        // A tribute to the "awesome hack by Dean Edwards"
                        // Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
                        // Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
                        // this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
                        if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {
                                width = style.width;
                                minWidth = style.minWidth;
                                maxWidth = style.maxWidth;

                                style.minWidth = style.maxWidth = style.width = ret;
                                ret = computed.width;

                                style.width = width;
                                style.minWidth = minWidth;
                                style.maxWidth = maxWidth;
                        }
                }

                return ret;
        };
} else if ( document.documentElement.currentStyle ) {
        curCSS = function( elem, name ) {
                var left, rsLeft,
                        ret = elem.currentStyle && elem.currentStyle[ name ],
                        style = elem.style;

                // Avoid setting ret to empty string here
                // so we don't default to auto
                if ( ret == null && style && style[ name ] ) {
                        ret = style[ name ];
                }

                // From the awesome hack by Dean Edwards
                // http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

                // If we're not dealing with a regular pixel number
                // but a number that has a weird ending, we need to convert it to pixels
                // but not position css attributes, as those are proportional to the parent element instead
                // and we can't measure the parent instead because it might trigger a "stacking dolls" problem
                if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

                        // Remember the original values
                        left = style.left;
                        rsLeft = elem.runtimeStyle && elem.runtimeStyle.left;

                        // Put in the new values to get a computed value out
                        if ( rsLeft ) {
                                elem.runtimeStyle.left = elem.currentStyle.left;
                        }
                        style.left = name === "fontSize" ? "1em" : ret;
                        ret = style.pixelLeft + "px";

                        // Revert the changed values
                        style.left = left;
                        if ( rsLeft ) {
                                elem.runtimeStyle.left = rsLeft;
                        }
                }

                return ret === "" ? "auto" : ret;
        };
}

function setPositiveNumber( elem, value, subtract ) {
        var matches = rnumsplit.exec( value );
        return matches ?
                        Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
                        value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox ) {
        var i = extra === ( isBorderBox ? "border" : "content" ) ?
                // If we already have the right measurement, avoid augmentation
                4 :
                // Otherwise initialize for horizontal or vertical properties
                name === "width" ? 1 : 0,

                val = 0;

        for ( ; i < 4; i += 2 ) {
                // both box models exclude margin, so add it if we want it
                if ( extra === "margin" ) {
                        // we use jQuery.css instead of curCSS here
                        // because of the reliableMarginRight CSS hook!
                        val += jQuery.css( elem, extra + cssExpand[ i ], true );
                }

                // From this point on we use curCSS for maximum performance (relevant in animations)
                if ( isBorderBox ) {
                        // border-box includes padding, so remove it if we want content
                        if ( extra === "content" ) {
                                val -= parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;
                        }

                        // at this point, extra isn't border nor margin, so remove border
                        if ( extra !== "margin" ) {
                                val -= parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
                        }
                } else {
                        // at this point, extra isn't content, so add padding
                        val += parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;

                        // at this point, extra isn't content nor padding, so add border
                        if ( extra !== "padding" ) {
                                val += parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
                        }
                }
        }

        return val;
}

function getWidthOrHeight( elem, name, extra ) {

        // Start with offset property, which is equivalent to the border-box value
        var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
                valueIsBorderBox = true,
                isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box";

        // some non-html elements return undefined for offsetWidth, so check for null/undefined
        // svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
        // MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
        if ( val <= 0 || val == null ) {
                // Fall back to computed then uncomputed css if necessary
                val = curCSS( elem, name );
                if ( val < 0 || val == null ) {
                        val = elem.style[ name ];
                }

                // Computed unit is not pixels. Stop here and return.
                if ( rnumnonpx.test(val) ) {
                        return val;
                }

                // we need the check for style in case a browser which returns unreliable values
                // for getComputedStyle silently falls back to the reliable elem.style
                valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

                // Normalize "", auto, and prepare for extra
                val = parseFloat( val ) || 0;
        }

        // use the active box-sizing model to add/subtract irrelevant styles
        return ( val +
                augmentWidthOrHeight(
                        elem,
                        name,
                        extra || ( isBorderBox ? "border" : "content" ),
                        valueIsBorderBox
                )
        ) + "px";
}


// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
        if ( elemdisplay[ nodeName ] ) {
                return elemdisplay[ nodeName ];
        }

        var elem = jQuery( "<" + nodeName + ">" ).appendTo( document.body ),
                display = elem.css("display");
        elem.remove();

        // If the simple way fails,
        // get element's real default display by attaching it to a temp iframe
        if ( display === "none" || display === "" ) {
                // Use the already-created iframe if possible
                iframe = document.body.appendChild(
                        iframe || jQuery.extend( document.createElement("iframe"), {
                                frameBorder: 0,
                                width: 0,
                                height: 0
                        })
                );

                // Create a cacheable copy of the iframe document on first call.
                // IE and Opera will allow us to reuse the iframeDoc without re-writing the fake HTML
                // document to it; WebKit & Firefox won't allow reusing the iframe document.
                if ( !iframeDoc || !iframe.createElement ) {
                        iframeDoc = ( iframe.contentWindow || iframe.contentDocument ).document;
                        iframeDoc.write("<!doctype html><html><body>");
                        iframeDoc.close();
                }

                elem = iframeDoc.body.appendChild( iframeDoc.createElement(nodeName) );

                display = curCSS( elem, "display" );
                document.body.removeChild( iframe );
        }

        // Store the correct default display
        elemdisplay[ nodeName ] = display;

        return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
        jQuery.cssHooks[ name ] = {
                get: function( elem, computed, extra ) {
                        if ( computed ) {
                                // certain elements can have dimension info if we invisibly show them
                                // however, it must have a current display style that would benefit from this
                                if ( elem.offsetWidth === 0 && rdisplayswap.test( curCSS( elem, "display" ) ) ) {
                                        return jQuery.swap( elem, cssShow, function() {
                                                return getWidthOrHeight( elem, name, extra );
                                        });
                                } else {
                                        return getWidthOrHeight( elem, name, extra );
                                }
                        }
                },

                set: function( elem, value, extra ) {
                        return setPositiveNumber( elem, value, extra ?
                                augmentWidthOrHeight(
                                        elem,
                                        name,
                                        extra,
                                        jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box"
                                ) : 0
                        );
                }
        };
});

if ( !jQuery.support.opacity ) {
        jQuery.cssHooks.opacity = {
                get: function( elem, computed ) {
                        // IE uses filters for opacity
                        return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
                                ( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
                                computed ? "1" : "";
                },

                set: function( elem, value ) {
                        var style = elem.style,
                                currentStyle = elem.currentStyle,
                                opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
                                filter = currentStyle && currentStyle.filter || style.filter || "";

                        // IE has trouble with opacity if it does not have layout
                        // Force it by setting the zoom level
                        style.zoom = 1;

                        // if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
                        if ( value >= 1 && jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
                                style.removeAttribute ) {

                                // Setting style.filter to null, "" & " " still leave "filter:" in the cssText
                                // if "filter:" is present at all, clearType is disabled, we want to avoid this
                                // style.removeAttribute is IE Only, but so apparently is this code path...
                                style.removeAttribute( "filter" );

                                // if there there is no filter style applied in a css rule, we are done
                                if ( currentStyle && !currentStyle.filter ) {
                                        return;
                                }
                        }

                        // otherwise, set new filter values
                        style.filter = ralpha.test( filter ) ?
                                filter.replace( ralpha, opacity ) :
                                filter + " " + opacity;
                }
        };
}

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
        if ( !jQuery.support.reliableMarginRight ) {
                jQuery.cssHooks.marginRight = {
                        get: function( elem, computed ) {
                                // WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
                                // Work around by temporarily setting element display to inline-block
                                return jQuery.swap( elem, { "display": "inline-block" }, function() {
                                        if ( computed ) {
                                                return curCSS( elem, "marginRight" );
                                        }
                                });
                        }
                };
        }

        // Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
        // getComputedStyle returns percent when specified for top/left/bottom/right
        // rather than make the css module depend on the offset module, we just check for it here
        if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
                jQuery.each( [ "top", "left" ], function( i, prop ) {
                        jQuery.cssHooks[ prop ] = {
                                get: function( elem, computed ) {
                                        if ( computed ) {
                                                var ret = curCSS( elem, prop );
                                                // if curCSS returns percentage, fallback to offset
                                                return rnumnonpx.test( ret ) ? jQuery( elem ).position()[ prop ] + "px" : ret;
                                        }
                                }
                        };
                });
        }

});

if ( jQuery.expr && jQuery.expr.filters ) {
        jQuery.expr.filters.hidden = function( elem ) {
                return ( elem.offsetWidth === 0 && elem.offsetHeight === 0 ) || (!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || curCSS( elem, "display" )) === "none");
        };

        jQuery.expr.filters.visible = function( elem ) {
                return !jQuery.expr.filters.hidden( elem );
        };
}

// These hooks are used by animate to expand properties
jQuery.each({
        margin: "",
        padding: "",
        border: "Width"
}, function( prefix, suffix ) {
        jQuery.cssHooks[ prefix + suffix ] = {
                expand: function( value ) {
                        var i,

                                // assumes a single number if not a string
                                parts = typeof value === "string" ? value.split(" ") : [ value ],
                                expanded = {};

                        for ( i = 0; i < 4; i++ ) {
                                expanded[ prefix + cssExpand[ i ] + suffix ] =
                                        parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
                        }

                        return expanded;
                }
        };

        if ( !rmargin.test( prefix ) ) {
                jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
        }
});
var r20 = /%20/g,
        rbracket = /\[\]$/,
        rCRLF = /\r?\n/g,
        rinput = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
        rselectTextarea = /^(?:select|textarea)/i;

jQuery.fn.extend({
        serialize: function() {
                return jQuery.param( this.serializeArray() );
        },
        serializeArray: function() {
                return this.map(function(){
                        return this.elements ? jQuery.makeArray( this.elements ) : this;
                })
                .filter(function(){
                        return this.name && !this.disabled &&
                                ( this.checked || rselectTextarea.test( this.nodeName ) ||
                                        rinput.test( this.type ) );
                })
                .map(function( i, elem ){
                        var val = jQuery( this ).val();

                        return val == null ?
                                null :
                                jQuery.isArray( val ) ?
                                        jQuery.map( val, function( val, i ){
                                                return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
                                        }) :
                                        { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
                }).get();
        }
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
        var prefix,
                s = [],
                add = function( key, value ) {
                        // If value is a function, invoke it and return its value
                        value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
                        s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
                };

        // Set traditional to true for jQuery <= 1.3.2 behavior.
        if ( traditional === undefined ) {
                traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
        }

        // If an array was passed in, assume that it is an array of form elements.
        if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
                // Serialize the form elements
                jQuery.each( a, function() {
                        add( this.name, this.value );
                });

        } else {
                // If traditional, encode the "old" way (the way 1.3.2 or older
                // did it), otherwise encode params recursively.
                for ( prefix in a ) {
                        buildParams( prefix, a[ prefix ], traditional, add );
                }
        }

        // Return the resulting serialization
        return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
        var name;

        if ( jQuery.isArray( obj ) ) {
                // Serialize array item.
                jQuery.each( obj, function( i, v ) {
                        if ( traditional || rbracket.test( prefix ) ) {
                                // Treat each array item as a scalar.
                                add( prefix, v );

                        } else {
                                // If array item is non-scalar (array or object), encode its
                                // numeric index to resolve deserialization ambiguity issues.
                                // Note that rack (as of 1.0.0) can't currently deserialize
                                // nested arrays properly, and attempting to do so may cause
                                // a server error. Possible fixes are to modify rack's
                                // deserialization algorithm or to provide an option or flag
                                // to force array serialization to be shallow.
                                buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
                        }
                });

        } else if ( !traditional && jQuery.type( obj ) === "object" ) {
                // Serialize object item.
                for ( name in obj ) {
                        buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
                }

        } else {
                // Serialize scalar item.
                add( prefix, obj );
        }
}
var
        // Document location
        ajaxLocParts,
        ajaxLocation,

        rhash = /#.*$/,
        rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
        // #7653, #8125, #8152: local protocol detection
        rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,
        rnoContent = /^(?:GET|HEAD)$/,
        rprotocol = /^\/\//,
        rquery = /\?/,
        rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        rts = /([?&])_=[^&]*/,
        rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

        // Keep a copy of the old load method
        _load = jQuery.fn.load,

        /* Prefilters
         * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
         * 2) These are called:
         *    - BEFORE asking for a transport
         *    - AFTER param serialization (s.data is a string if s.processData is true)
         * 3) key is the dataType
         * 4) the catchall symbol "*" can be used
         * 5) execution will start with transport dataType and THEN continue down to "*" if needed
         */
        prefilters = {},

        /* Transports bindings
         * 1) key is the dataType
         * 2) the catchall symbol "*" can be used
         * 3) selection will start with transport dataType and THEN go to "*" if needed
         */
        transports = {},

        // Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
        allTypes = ["*/"] + ["*"];

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
        ajaxLocation = location.href;
} catch( e ) {
        // Use the href attribute of an A element
        // since IE will modify it given document.location
        ajaxLocation = document.createElement( "a" );
        ajaxLocation.href = "";
        ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

        // dataTypeExpression is optional and defaults to "*"
        return function( dataTypeExpression, func ) {

                if ( typeof dataTypeExpression !== "string" ) {
                        func = dataTypeExpression;
                        dataTypeExpression = "*";
                }

                var dataType, list, placeBefore,
                        dataTypes = dataTypeExpression.toLowerCase().split( core_rspace ),
                        i = 0,
                        length = dataTypes.length;

                if ( jQuery.isFunction( func ) ) {
                        // For each dataType in the dataTypeExpression
                        for ( ; i < length; i++ ) {
                                dataType = dataTypes[ i ];
                                // We control if we're asked to add before
                                // any existing element
                                placeBefore = /^\+/.test( dataType );
                                if ( placeBefore ) {
                                        dataType = dataType.substr( 1 ) || "*";
                                }
                                list = structure[ dataType ] = structure[ dataType ] || [];
                                // then we add to the structure accordingly
                                list[ placeBefore ? "unshift" : "push" ]( func );
                        }
                }
        };
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR,
                dataType /* internal */, inspected /* internal */ ) {

        dataType = dataType || options.dataTypes[ 0 ];
        inspected = inspected || {};

        inspected[ dataType ] = true;

        var selection,
                list = structure[ dataType ],
                i = 0,
                length = list ? list.length : 0,
                executeOnly = ( structure === prefilters );

        for ( ; i < length && ( executeOnly || !selection ); i++ ) {
                selection = list[ i ]( options, originalOptions, jqXHR );
                // If we got redirected to another dataType
                // we try there if executing only and not done already
                if ( typeof selection === "string" ) {
                        if ( !executeOnly || inspected[ selection ] ) {
                                selection = undefined;
                        } else {
                                options.dataTypes.unshift( selection );
                                selection = inspectPrefiltersOrTransports(
                                                structure, options, originalOptions, jqXHR, selection, inspected );
                        }
                }
        }
        // If we're only executing or nothing was selected
        // we try the catchall dataType if not done already
        if ( ( executeOnly || !selection ) && !inspected[ "*" ] ) {
                selection = inspectPrefiltersOrTransports(
                                structure, options, originalOptions, jqXHR, "*", inspected );
        }
        // unnecessary when only executing (prefilters)
        // but it'll be ignored by the caller in that case
        return selection;
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
        var key, deep,
                flatOptions = jQuery.ajaxSettings.flatOptions || {};
        for ( key in src ) {
                if ( src[ key ] !== undefined ) {
                        ( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
                }
        }
        if ( deep ) {
                jQuery.extend( true, target, deep );
        }
}

jQuery.fn.load = function( url, params, callback ) {
        if ( typeof url !== "string" && _load ) {
                return _load.apply( this, arguments );
        }

        // Don't do a request if no elements are being requested
        if ( !this.length ) {
                return this;
        }

        var selector, type, response,
                self = this,
                off = url.indexOf(" ");

        if ( off >= 0 ) {
                selector = url.slice( off, url.length );
                url = url.slice( 0, off );
        }

        // If it's a function
        if ( jQuery.isFunction( params ) ) {

                // We assume that it's the callback
                callback = params;
                params = undefined;

        // Otherwise, build a param string
        } else if ( params && typeof params === "object" ) {
                type = "POST";
        }

        // Request the remote document
        jQuery.ajax({
                url: url,

                // if "type" variable is undefined, then "GET" method will be used
                type: type,
                dataType: "html",
                data: params,
                complete: function( jqXHR, status ) {
                        if ( callback ) {
                                self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
                        }
                }
        }).done(function( responseText ) {

                // Save response for use in complete callback
                response = arguments;

                // See if a selector was specified
                self.html( selector ?

                        // Create a dummy div to hold the results
                        jQuery("<div>")

                                // inject the contents of the document in, removing the scripts
                                // to avoid any 'Permission Denied' errors in IE
                                .append( responseText.replace( rscript, "" ) )

                                // Locate the specified elements
                                .find( selector ) :

                        // If not, just inject the full result
                        responseText );

        });

        return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( "ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split( " " ), function( i, o ){
        jQuery.fn[ o ] = function( f ){
                return this.on( o, f );
        };
});

jQuery.each( [ "get", "post" ], function( i, method ) {
        jQuery[ method ] = function( url, data, callback, type ) {
                // shift arguments if data argument was omitted
                if ( jQuery.isFunction( data ) ) {
                        type = type || callback;
                        callback = data;
                        data = undefined;
                }

                return jQuery.ajax({
                        type: method,
                        url: url,
                        data: data,
                        success: callback,
                        dataType: type
                });
        };
});

jQuery.extend({

        getScript: function( url, callback ) {
                return jQuery.get( url, undefined, callback, "script" );
        },

        getJSON: function( url, data, callback ) {
                return jQuery.get( url, data, callback, "json" );
        },

        // Creates a full fledged settings object into target
        // with both ajaxSettings and settings fields.
        // If target is omitted, writes into ajaxSettings.
        ajaxSetup: function( target, settings ) {
                if ( settings ) {
                        // Building a settings object
                        ajaxExtend( target, jQuery.ajaxSettings );
                } else {
                        // Extending ajaxSettings
                        settings = target;
                        target = jQuery.ajaxSettings;
                }
                ajaxExtend( target, settings );
                return target;
        },

        ajaxSettings: {
                url: ajaxLocation,
                isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
                global: true,
                type: "GET",
                contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                processData: true,
                async: true,
                /*
                timeout: 0,
                data: null,
                dataType: null,
                username: null,
                password: null,
                cache: null,
                throws: false,
                traditional: false,
                headers: {},
                */

                accepts: {
                        xml: "application/xml, text/xml",
                        html: "text/html",
                        text: "text/plain",
                        json: "application/json, text/javascript",
                        "*": allTypes
                },

                contents: {
                        xml: /xml/,
                        html: /html/,
                        json: /json/
                },

                responseFields: {
                        xml: "responseXML",
                        text: "responseText"
                },

                // List of data converters
                // 1) key format is "source_type destination_type" (a single space in-between)
                // 2) the catchall symbol "*" can be used for source_type
                converters: {

                        // Convert anything to text
                        "* text": window.String,

                        // Text to html (true = no transformation)
                        "text html": true,

                        // Evaluate text as a json expression
                        "text json": jQuery.parseJSON,

                        // Parse text as xml
                        "text xml": jQuery.parseXML
                },

                // For options that shouldn't be deep extended:
                // you can add your own custom options here if
                // and when you create one that shouldn't be
                // deep extended (see ajaxExtend)
                flatOptions: {
                        context: true,
                        url: true
                }
        },

        ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
        ajaxTransport: addToPrefiltersOrTransports( transports ),

        // Main method
        ajax: function( url, options ) {

                // If url is an object, simulate pre-1.5 signature
                if ( typeof url === "object" ) {
                        options = url;
                        url = undefined;
                }

                // Force options to be an object
                options = options || {};

                var // ifModified key
                        ifModifiedKey,
                        // Response headers
                        responseHeadersString,
                        responseHeaders,
                        // transport
                        transport,
                        // timeout handle
                        timeoutTimer,
                        // Cross-domain detection vars
                        parts,
                        // To know if global events are to be dispatched
                        fireGlobals,
                        // Loop variable
                        i,
                        // Create the final options object
                        s = jQuery.ajaxSetup( {}, options ),
                        // Callbacks context
                        callbackContext = s.context || s,
                        // Context for global events
                        // It's the callbackContext if one was provided in the options
                        // and if it's a DOM node or a jQuery collection
                        globalEventContext = callbackContext !== s &&
                                ( callbackContext.nodeType || callbackContext instanceof jQuery ) ?
                                                jQuery( callbackContext ) : jQuery.event,
                        // Deferreds
                        deferred = jQuery.Deferred(),
                        completeDeferred = jQuery.Callbacks( "once memory" ),
                        // Status-dependent callbacks
                        statusCode = s.statusCode || {},
                        // Headers (they are sent all at once)
                        requestHeaders = {},
                        requestHeadersNames = {},
                        // The jqXHR state
                        state = 0,
                        // Default abort message
                        strAbort = "canceled",
                        // Fake xhr
                        jqXHR = {

                                readyState: 0,

                                // Caches the header
                                setRequestHeader: function( name, value ) {
                                        if ( !state ) {
                                                var lname = name.toLowerCase();
                                                name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
                                                requestHeaders[ name ] = value;
                                        }
                                        return this;
                                },

                                // Raw string
                                getAllResponseHeaders: function() {
                                        return state === 2 ? responseHeadersString : null;
                                },

                                // Builds headers hashtable if needed
                                getResponseHeader: function( key ) {
                                        var match;
                                        if ( state === 2 ) {
                                                if ( !responseHeaders ) {
                                                        responseHeaders = {};
                                                        while( ( match = rheaders.exec( responseHeadersString ) ) ) {
                                                                responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
                                                        }
                                                }
                                                match = responseHeaders[ key.toLowerCase() ];
                                        }
                                        return match === undefined ? null : match;
                                },

                                // Overrides response content-type header
                                overrideMimeType: function( type ) {
                                        if ( !state ) {
                                                s.mimeType = type;
                                        }
                                        return this;
                                },

                                // Cancel the request
                                abort: function( statusText ) {
                                        statusText = statusText || strAbort;
                                        if ( transport ) {
                                                transport.abort( statusText );
                                        }
                                        done( 0, statusText );
                                        return this;
                                }
                        };

                // Callback for when everything is done
                // It is defined here because jslint complains if it is declared
                // at the end of the function (which would be more logical and readable)
                function done( status, nativeStatusText, responses, headers ) {
                        var isSuccess, success, error, response, modified,
                                statusText = nativeStatusText;

                        // Called once
                        if ( state === 2 ) {
                                return;
                        }

                        // State is "done" now
                        state = 2;

                        // Clear timeout if it exists
                        if ( timeoutTimer ) {
                                clearTimeout( timeoutTimer );
                        }

                        // Dereference transport for early garbage collection
                        // (no matter how long the jqXHR object will be used)
                        transport = undefined;

                        // Cache response headers
                        responseHeadersString = headers || "";

                        // Set readyState
                        jqXHR.readyState = status > 0 ? 4 : 0;

                        // Get response data
                        if ( responses ) {
                                response = ajaxHandleResponses( s, jqXHR, responses );
                        }

                        // If successful, handle type chaining
                        if ( status >= 200 && status < 300 || status === 304 ) {

                                // Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
                                if ( s.ifModified ) {

                                        modified = jqXHR.getResponseHeader("Last-Modified");
                                        if ( modified ) {
                                                jQuery.lastModified[ ifModifiedKey ] = modified;
                                        }
                                        modified = jqXHR.getResponseHeader("Etag");
                                        if ( modified ) {
                                                jQuery.etag[ ifModifiedKey ] = modified;
                                        }
                                }

                                // If not modified
                                if ( status === 304 ) {

                                        statusText = "notmodified";
                                        isSuccess = true;

                                // If we have data
                                } else {

                                        isSuccess = ajaxConvert( s, response );
                                        statusText = isSuccess.state;
                                        success = isSuccess.data;
                                        error = isSuccess.error;
                                        isSuccess = !error;
                                }
                        } else {
                                // We extract error from statusText
                                // then normalize statusText and status for non-aborts
                                error = statusText;
                                if ( !statusText || status ) {
                                        statusText = "error";
                                        if ( status < 0 ) {
                                                status = 0;
                                        }
                                }
                        }

                        // Set data for the fake xhr object
                        jqXHR.status = status;
                        jqXHR.statusText = ( nativeStatusText || statusText ) + "";

                        // Success/Error
                        if ( isSuccess ) {
                                deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
                        } else {
                                deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
                        }

                        // Status-dependent callbacks
                        jqXHR.statusCode( statusCode );
                        statusCode = undefined;

                        if ( fireGlobals ) {
                                globalEventContext.trigger( "ajax" + ( isSuccess ? "Success" : "Error" ),
                                                [ jqXHR, s, isSuccess ? success : error ] );
                        }

                        // Complete
                        completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

                        if ( fireGlobals ) {
                                globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
                                // Handle the global AJAX counter
                                if ( !( --jQuery.active ) ) {
                                        jQuery.event.trigger( "ajaxStop" );
                                }
                        }
                }

                // Attach deferreds
                deferred.promise( jqXHR );
                jqXHR.success = jqXHR.done;
                jqXHR.error = jqXHR.fail;
                jqXHR.complete = completeDeferred.add;

                // Status-dependent callbacks
                jqXHR.statusCode = function( map ) {
                        if ( map ) {
                                var tmp;
                                if ( state < 2 ) {
                                        for ( tmp in map ) {
                                                statusCode[ tmp ] = [ statusCode[tmp], map[tmp] ];
                                        }
                                } else {
                                        tmp = map[ jqXHR.status ];
                                        jqXHR.always( tmp );
                                }
                        }
                        return this;
                };

                // Remove hash character (#7531: and string promotion)
                // Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
                // We also use the url parameter if available
                s.url = ( ( url || s.url ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

                // Extract dataTypes list
                s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().split( core_rspace );

                // A cross-domain request is in order when we have a protocol:host:port mismatch
                if ( s.crossDomain == null ) {
                        parts = rurl.exec( s.url.toLowerCase() );
                        s.crossDomain = !!( parts &&
                                ( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
                                        ( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
                                                ( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
                        );
                }

                // Convert data if not already a string
                if ( s.data && s.processData && typeof s.data !== "string" ) {
                        s.data = jQuery.param( s.data, s.traditional );
                }

                // Apply prefilters
                inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

                // If request was aborted inside a prefilter, stop there
                if ( state === 2 ) {
                        return jqXHR;
                }

                // We can fire global events as of now if asked to
                fireGlobals = s.global;

                // Uppercase the type
                s.type = s.type.toUpperCase();

                // Determine if request has content
                s.hasContent = !rnoContent.test( s.type );

                // Watch for a new set of requests
                if ( fireGlobals && jQuery.active++ === 0 ) {
                        jQuery.event.trigger( "ajaxStart" );
                }

                // More options handling for requests with no content
                if ( !s.hasContent ) {

                        // If data is available, append data to url
                        if ( s.data ) {
                                s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.data;
                                // #9682: remove data so that it's not used in an eventual retry
                                delete s.data;
                        }

                        // Get ifModifiedKey before adding the anti-cache parameter
                        ifModifiedKey = s.url;

                        // Add anti-cache in url if needed
                        if ( s.cache === false ) {

                                var ts = jQuery.now(),
                                        // try replacing _= if it is there
                                        ret = s.url.replace( rts, "$1_=" + ts );

                                // if nothing was replaced, add timestamp to the end
                                s.url = ret + ( ( ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
                        }
                }

                // Set the correct header, if data is being sent
                if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
                        jqXHR.setRequestHeader( "Content-Type", s.contentType );
                }

                // Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
                if ( s.ifModified ) {
                        ifModifiedKey = ifModifiedKey || s.url;
                        if ( jQuery.lastModified[ ifModifiedKey ] ) {
                                jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ ifModifiedKey ] );
                        }
                        if ( jQuery.etag[ ifModifiedKey ] ) {
                                jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ ifModifiedKey ] );
                        }
                }

                // Set the Accepts header for the server, depending on the dataType
                jqXHR.setRequestHeader(
                        "Accept",
                        s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
                                s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
                                s.accepts[ "*" ]
                );

                // Check for headers option
                for ( i in s.headers ) {
                        jqXHR.setRequestHeader( i, s.headers[ i ] );
                }

                // Allow custom headers/mimetypes and early abort
                if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
                                // Abort if not done already and return
                                return jqXHR.abort();

                }

                // aborting is no longer a cancellation
                strAbort = "abort";

                // Install callbacks on deferreds
                for ( i in { success: 1, error: 1, complete: 1 } ) {
                        jqXHR[ i ]( s[ i ] );
                }

                // Get transport
                transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

                // If no transport, we auto-abort
                if ( !transport ) {
                        done( -1, "No Transport" );
                } else {
                        jqXHR.readyState = 1;
                        // Send global event
                        if ( fireGlobals ) {
                                globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
                        }
                        // Timeout
                        if ( s.async && s.timeout > 0 ) {
                                timeoutTimer = setTimeout( function(){
                                        jqXHR.abort( "timeout" );
                                }, s.timeout );
                        }

                        try {
                                state = 1;
                                transport.send( requestHeaders, done );
                        } catch (e) {
                                // Propagate exception as error if not done
                                if ( state < 2 ) {
                                        done( -1, e );
                                // Simply rethrow otherwise
                                } else {
                                        throw e;
                                }
                        }
                }

                return jqXHR;
        },

        // Counter for holding the number of active queries
        active: 0,

        // Last-Modified header cache for next request
        lastModified: {},
        etag: {}

});

/* Handles responses to an ajax request:
 * - sets all responseXXX fields accordingly
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

        var ct, type, finalDataType, firstDataType,
                contents = s.contents,
                dataTypes = s.dataTypes,
                responseFields = s.responseFields;

        // Fill responseXXX fields
        for ( type in responseFields ) {
                if ( type in responses ) {
                        jqXHR[ responseFields[type] ] = responses[ type ];
                }
        }

        // Remove auto dataType and get content-type in the process
        while( dataTypes[ 0 ] === "*" ) {
                dataTypes.shift();
                if ( ct === undefined ) {
                        ct = s.mimeType || jqXHR.getResponseHeader( "content-type" );
                }
        }

        // Check if we're dealing with a known content-type
        if ( ct ) {
                for ( type in contents ) {
                        if ( contents[ type ] && contents[ type ].test( ct ) ) {
                                dataTypes.unshift( type );
                                break;
                        }
                }
        }

        // Check to see if we have a response for the expected dataType
        if ( dataTypes[ 0 ] in responses ) {
                finalDataType = dataTypes[ 0 ];
        } else {
                // Try convertible dataTypes
                for ( type in responses ) {
                        if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
                                finalDataType = type;
                                break;
                        }
                        if ( !firstDataType ) {
                                firstDataType = type;
                        }
                }
                // Or just use first one
                finalDataType = finalDataType || firstDataType;
        }

        // If we found a dataType
        // We add the dataType to the list if needed
        // and return the corresponding response
        if ( finalDataType ) {
                if ( finalDataType !== dataTypes[ 0 ] ) {
                        dataTypes.unshift( finalDataType );
                }
                return responses[ finalDataType ];
        }
}

// Chain conversions given the request and the original response
function ajaxConvert( s, response ) {

        var conv, conv2, current, tmp,
                // Work with a copy of dataTypes in case we need to modify it for conversion
                dataTypes = s.dataTypes.slice(),
                prev = dataTypes[ 0 ],
                converters = {},
                i = 0;

        // Apply the dataFilter if provided
        if ( s.dataFilter ) {
                response = s.dataFilter( response, s.dataType );
        }

        // Create converters map with lowercased keys
        if ( dataTypes[ 1 ] ) {
                for ( conv in s.converters ) {
                        converters[ conv.toLowerCase() ] = s.converters[ conv ];
                }
        }

        // Convert to each sequential dataType, tolerating list modification
        for ( ; (current = dataTypes[++i]); ) {

                // There's only work to do if current dataType is non-auto
                if ( current !== "*" ) {

                        // Convert response if prev dataType is non-auto and differs from current
                        if ( prev !== "*" && prev !== current ) {

                                // Seek a direct converter
                                conv = converters[ prev + " " + current ] || converters[ "* " + current ];

                                // If none found, seek a pair
                                if ( !conv ) {
                                        for ( conv2 in converters ) {

                                                // If conv2 outputs current
                                                tmp = conv2.split(" ");
                                                if ( tmp[ 1 ] === current ) {

                                                        // If prev can be converted to accepted input
                                                        conv = converters[ prev + " " + tmp[ 0 ] ] ||
                                                                converters[ "* " + tmp[ 0 ] ];
                                                        if ( conv ) {
                                                                // Condense equivalence converters
                                                                if ( conv === true ) {
                                                                        conv = converters[ conv2 ];

                                                                // Otherwise, insert the intermediate dataType
                                                                } else if ( converters[ conv2 ] !== true ) {
                                                                        current = tmp[ 0 ];
                                                                        dataTypes.splice( i--, 0, current );
                                                                }

                                                                break;
                                                        }
                                                }
                                        }
                                }

                                // Apply converter (if not an equivalence)
                                if ( conv !== true ) {

                                        // Unless errors are allowed to bubble, catch and return them
                                        if ( conv && s["throws"] ) {
                                                response = conv( response );
                                        } else {
                                                try {
                                                        response = conv( response );
                                                } catch ( e ) {
                                                        return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
                                                }
                                        }
                                }
                        }

                        // Update prev for next iteration
                        prev = current;
                }
        }

        return { state: "success", data: response };
}
var oldCallbacks = [],
        rquestion = /\?/,
        rjsonp = /(=)\?(?=&|$)|\?\?/,
        nonce = jQuery.now();

// Default jsonp settings
jQuery.ajaxSetup({
        jsonp: "callback",
        jsonpCallback: function() {
                var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
                this[ callback ] = true;
                return callback;
        }
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

        var callbackName, overwritten, responseContainer,
                data = s.data,
                url = s.url,
                hasCallback = s.jsonp !== false,
                replaceInUrl = hasCallback && rjsonp.test( url ),
                replaceInData = hasCallback && !replaceInUrl && typeof data === "string" &&
                        !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") &&
                        rjsonp.test( data );

        // Handle iff the expected data type is "jsonp" or we have a parameter to set
        if ( s.dataTypes[ 0 ] === "jsonp" || replaceInUrl || replaceInData ) {

                // Get callback name, remembering preexisting value associated with it
                callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
                        s.jsonpCallback() :
                        s.jsonpCallback;
                overwritten = window[ callbackName ];

                // Insert callback into url or form data
                if ( replaceInUrl ) {
                        s.url = url.replace( rjsonp, "$1" + callbackName );
                } else if ( replaceInData ) {
                        s.data = data.replace( rjsonp, "$1" + callbackName );
                } else if ( hasCallback ) {
                        s.url += ( rquestion.test( url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
                }

                // Use data converter to retrieve json after script execution
                s.converters["script json"] = function() {
                        if ( !responseContainer ) {
                                jQuery.error( callbackName + " was not called" );
                        }
                        return responseContainer[ 0 ];
                };

                // force json dataType
                s.dataTypes[ 0 ] = "json";

                // Install callback
                window[ callbackName ] = function() {
                        responseContainer = arguments;
                };

                // Clean-up function (fires after converters)
                jqXHR.always(function() {
                        // Restore preexisting value
                        window[ callbackName ] = overwritten;

                        // Save back as free
                        if ( s[ callbackName ] ) {
                                // make sure that re-using the options doesn't screw things around
                                s.jsonpCallback = originalSettings.jsonpCallback;

                                // save the callback name for future use
                                oldCallbacks.push( callbackName );
                        }

                        // Call if it was a function and we have a response
                        if ( responseContainer && jQuery.isFunction( overwritten ) ) {
                                overwritten( responseContainer[ 0 ] );
                        }

                        responseContainer = overwritten = undefined;
                });

                // Delegate to script
                return "script";
        }
});
// Install script dataType
jQuery.ajaxSetup({
        accepts: {
                script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
        },
        contents: {
                script: /javascript|ecmascript/
        },
        converters: {
                "text script": function( text ) {
                        jQuery.globalEval( text );
                        return text;
                }
        }
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
        if ( s.cache === undefined ) {
                s.cache = false;
        }
        if ( s.crossDomain ) {
                s.type = "GET";
                s.global = false;
        }
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

        // This transport only deals with cross domain requests
        if ( s.crossDomain ) {

                var script,
                        head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;

                return {

                        send: function( _, callback ) {

                                script = document.createElement( "script" );

                                script.async = "async";

                                if ( s.scriptCharset ) {
                                        script.charset = s.scriptCharset;
                                }

                                script.src = s.url;

                                // Attach handlers for all browsers
                                script.onload = script.onreadystatechange = function( _, isAbort ) {

                                        if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

                                                // Handle memory leak in IE
                                                script.onload = script.onreadystatechange = null;

                                                // Remove the script
                                                if ( head && script.parentNode ) {
                                                        head.removeChild( script );
                                                }

                                                // Dereference the script
                                                script = undefined;

                                                // Callback if not abort
                                                if ( !isAbort ) {
                                                        callback( 200, "success" );
                                                }
                                        }
                                };
                                // Use insertBefore instead of appendChild  to circumvent an IE6 bug.
                                // This arises when a base node is used (#2709 and #4378).
                                head.insertBefore( script, head.firstChild );
                        },

                        abort: function() {
                                if ( script ) {
                                        script.onload( 0, 1 );
                                }
                        }
                };
        }
});
var xhrCallbacks,
        // #5280: Internet Explorer will keep connections alive if we don't abort on unload
        xhrOnUnloadAbort = window.ActiveXObject ? function() {
                // Abort all pending requests
                for ( var key in xhrCallbacks ) {
                        xhrCallbacks[ key ]( 0, 1 );
                }
        } : false,
        xhrId = 0;

// Functions to create xhrs
function createStandardXHR() {
        try {
                return new window.XMLHttpRequest();
        } catch( e ) {}
}

function createActiveXHR() {
        try {
                return new window.ActiveXObject( "Microsoft.XMLHTTP" );
        } catch( e ) {}
}

// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject ?
        /* Microsoft failed to properly
         * implement the XMLHttpRequest in IE7 (can't request local files),
         * so we use the ActiveXObject when it is available
         * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
         * we need a fallback.
         */
        function() {
                return !this.isLocal && createStandardXHR() || createActiveXHR();
        } :
        // For all other browsers, use the standard XMLHttpRequest object
        createStandardXHR;

// Determine support properties
(function( xhr ) {
        jQuery.extend( jQuery.support, {
                ajax: !!xhr,
                cors: !!xhr && ( "withCredentials" in xhr )
        });
})( jQuery.ajaxSettings.xhr() );

// Create transport if the browser can provide an xhr
if ( jQuery.support.ajax ) {

        jQuery.ajaxTransport(function( s ) {
                // Cross domain only allowed if supported through XMLHttpRequest
                if ( !s.crossDomain || jQuery.support.cors ) {

                        var callback;

                        return {
                                send: function( headers, complete ) {

                                        // Get a new xhr
                                        var handle, i,
                                                xhr = s.xhr();

                                        // Open the socket
                                        // Passing null username, generates a login popup on Opera (#2865)
                                        if ( s.username ) {
                                                xhr.open( s.type, s.url, s.async, s.username, s.password );
                                        } else {
                                                xhr.open( s.type, s.url, s.async );
                                        }

                                        // Apply custom fields if provided
                                        if ( s.xhrFields ) {
                                                for ( i in s.xhrFields ) {
                                                        xhr[ i ] = s.xhrFields[ i ];
                                                }
                                        }

                                        // Override mime type if needed
                                        if ( s.mimeType && xhr.overrideMimeType ) {
                                                xhr.overrideMimeType( s.mimeType );
                                        }

                                        // X-Requested-With header
                                        // For cross-domain requests, seeing as conditions for a preflight are
                                        // akin to a jigsaw puzzle, we simply never set it to be sure.
                                        // (it can always be set on a per-request basis or even using ajaxSetup)
                                        // For same-domain requests, won't change header if already provided.
                                        if ( !s.crossDomain && !headers["X-Requested-With"] ) {
                                                headers[ "X-Requested-With" ] = "XMLHttpRequest";
                                        }

                                        // Need an extra try/catch for cross domain requests in Firefox 3
                                        try {
                                                for ( i in headers ) {
                                                        xhr.setRequestHeader( i, headers[ i ] );
                                                }
                                        } catch( _ ) {}

                                        // Do send the request
                                        // This may raise an exception which is actually
                                        // handled in jQuery.ajax (so no try/catch here)
                                        xhr.send( ( s.hasContent && s.data ) || null );

                                        // Listener
                                        callback = function( _, isAbort ) {

                                                var status,
                                                        statusText,
                                                        responseHeaders,
                                                        responses,
                                                        xml;

                                                // Firefox throws exceptions when accessing properties
                                                // of an xhr when a network error occurred
                                                // http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
                                                try {

                                                        // Was never called and is aborted or complete
                                                        if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

                                                                // Only called once
                                                                callback = undefined;

                                                                // Do not keep as active anymore
                                                                if ( handle ) {
                                                                        xhr.onreadystatechange = jQuery.noop;
                                                                        if ( xhrOnUnloadAbort ) {
                                                                                delete xhrCallbacks[ handle ];
                                                                        }
                                                                }

                                                                // If it's an abort
                                                                if ( isAbort ) {
                                                                        // Abort it manually if needed
                                                                        if ( xhr.readyState !== 4 ) {
                                                                                xhr.abort();
                                                                        }
                                                                } else {
                                                                        status = xhr.status;
                                                                        responseHeaders = xhr.getAllResponseHeaders();
                                                                        responses = {};
                                                                        xml = xhr.responseXML;

                                                                        // Construct response list
                                                                        if ( xml && xml.documentElement /* #4958 */ ) {
                                                                                responses.xml = xml;
                                                                        }

                                                                        // When requesting binary data, IE6-9 will throw an exception
                                                                        // on any attempt to access responseText (#11426)
                                                                        try {
                                                                                responses.text = xhr.responseText;
                                                                        } catch( e ) {
                                                                        }

                                                                        // Firefox throws an exception when accessing
                                                                        // statusText for faulty cross-domain requests
                                                                        try {
                                                                                statusText = xhr.statusText;
                                                                        } catch( e ) {
                                                                                // We normalize with Webkit giving an empty statusText
                                                                                statusText = "";
                                                                        }

                                                                        // Filter status for non standard behaviors

                                                                        // If the request is local and we have data: assume a success
                                                                        // (success with no data won't get notified, that's the best we
                                                                        // can do given current implementations)
                                                                        if ( !status && s.isLocal && !s.crossDomain ) {
                                                                                status = responses.text ? 200 : 404;
                                                                        // IE - #1450: sometimes returns 1223 when it should be 204
                                                                        } else if ( status === 1223 ) {
                                                                                status = 204;
                                                                        }
                                                                }
                                                        }
                                                } catch( firefoxAccessException ) {
                                                        if ( !isAbort ) {
                                                                complete( -1, firefoxAccessException );
                                                        }
                                                }

                                                // Call complete if needed
                                                if ( responses ) {
                                                        complete( status, statusText, responses, responseHeaders );
                                                }
                                        };

                                        if ( !s.async ) {
                                                // if we're in sync mode we fire the callback
                                                callback();
                                        } else if ( xhr.readyState === 4 ) {
                                                // (IE6 & IE7) if it's in cache and has been
                                                // retrieved directly we need to fire the callback
                                                setTimeout( callback, 0 );
                                        } else {
                                                handle = ++xhrId;
                                                if ( xhrOnUnloadAbort ) {
                                                        // Create the active xhrs callbacks list if needed
                                                        // and attach the unload handler
                                                        if ( !xhrCallbacks ) {
                                                                xhrCallbacks = {};
                                                                jQuery( window ).unload( xhrOnUnloadAbort );
                                                        }
                                                        // Add to list of active xhrs callbacks
                                                        xhrCallbacks[ handle ] = callback;
                                                }
                                                xhr.onreadystatechange = callback;
                                        }
                                },

                                abort: function() {
                                        if ( callback ) {
                                                callback(0,1);
                                        }
                                }
                        };
                }
        });
}
var fxNow, timerId,
        rfxtypes = /^(?:toggle|show|hide)$/,
        rfxnum = new RegExp( "^(?:([-+])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
        rrun = /queueHooks$/,
        animationPrefilters = [ defaultPrefilter ],
        tweeners = {
                "*": [function( prop, value ) {
                        var end, unit,
                                tween = this.createTween( prop, value ),
                                parts = rfxnum.exec( value ),
                                target = tween.cur(),
                                start = +target || 0,
                                scale = 1,
                                maxIterations = 20;

                        if ( parts ) {
                                end = +parts[2];
                                unit = parts[3] || ( jQuery.cssNumber[ prop ] ? "" : "px" );

                                // We need to compute starting value
                                if ( unit !== "px" && start ) {
                                        // Iteratively approximate from a nonzero starting point
                                        // Prefer the current property, because this process will be trivial if it uses the same units
                                        // Fallback to end or a simple constant
                                        start = jQuery.css( tween.elem, prop, true ) || end || 1;

                                        do {
                                                // If previous iteration zeroed out, double until we get *something*
                                                // Use a string for doubling factor so we don't accidentally see scale as unchanged below
                                                scale = scale || ".5";

                                                // Adjust and apply
                                                start = start / scale;
                                                jQuery.style( tween.elem, prop, start + unit );

                                        // Update scale, tolerating zero or NaN from tween.cur()
                                        // And breaking the loop if scale is unchanged or perfect, or if we've just had enough
                                        } while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
                                }

                                tween.unit = unit;
                                tween.start = start;
                                // If a +=/-= token was provided, we're doing a relative animation
                                tween.end = parts[1] ? start + ( parts[1] + 1 ) * end : end;
                        }
                        return tween;
                }]
        };

// Animations created synchronously will run synchronously
function createFxNow() {
        setTimeout(function() {
                fxNow = undefined;
        }, 0 );
        return ( fxNow = jQuery.now() );
}

function createTweens( animation, props ) {
        jQuery.each( props, function( prop, value ) {
                var collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
                        index = 0,
                        length = collection.length;
                for ( ; index < length; index++ ) {
                        if ( collection[ index ].call( animation, prop, value ) ) {

                                // we're done with this property
                                return;
                        }
                }
        });
}

function Animation( elem, properties, options ) {
        var result,
                index = 0,
                tweenerIndex = 0,
                length = animationPrefilters.length,
                deferred = jQuery.Deferred().always( function() {
                        // don't match elem in the :animated selector
                        delete tick.elem;
                }),
                tick = function() {
                        var currentTime = fxNow || createFxNow(),
                                remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
                                // archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
                                temp = remaining / animation.duration || 0,
                                percent = 1 - temp,
                                index = 0,
                                length = animation.tweens.length;

                        for ( ; index < length ; index++ ) {
                                animation.tweens[ index ].run( percent );
                        }

                        deferred.notifyWith( elem, [ animation, percent, remaining ]);

                        if ( percent < 1 && length ) {
                                return remaining;
                        } else {
                                deferred.resolveWith( elem, [ animation ] );
                                return false;
                        }
                },
                animation = deferred.promise({
                        elem: elem,
                        props: jQuery.extend( {}, properties ),
                        opts: jQuery.extend( true, { specialEasing: {} }, options ),
                        originalProperties: properties,
                        originalOptions: options,
                        startTime: fxNow || createFxNow(),
                        duration: options.duration,
                        tweens: [],
                        createTween: function( prop, end, easing ) {
                                var tween = jQuery.Tween( elem, animation.opts, prop, end,
                                                animation.opts.specialEasing[ prop ] || animation.opts.easing );
                                animation.tweens.push( tween );
                                return tween;
                        },
                        stop: function( gotoEnd ) {
                                var index = 0,
                                        // if we are going to the end, we want to run all the tweens
                                        // otherwise we skip this part
                                        length = gotoEnd ? animation.tweens.length : 0;

                                for ( ; index < length ; index++ ) {
                                        animation.tweens[ index ].run( 1 );
                                }

                                // resolve when we played the last frame
                                // otherwise, reject
                                if ( gotoEnd ) {
                                        deferred.resolveWith( elem, [ animation, gotoEnd ] );
                                } else {
                                        deferred.rejectWith( elem, [ animation, gotoEnd ] );
                                }
                                return this;
                        }
                }),
                props = animation.props;

        propFilter( props, animation.opts.specialEasing );

        for ( ; index < length ; index++ ) {
                result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
                if ( result ) {
                        return result;
                }
        }

        createTweens( animation, props );

        if ( jQuery.isFunction( animation.opts.start ) ) {
                animation.opts.start.call( elem, animation );
        }

        jQuery.fx.timer(
                jQuery.extend( tick, {
                        anim: animation,
                        queue: animation.opts.queue,
                        elem: elem
                })
        );

        // attach callbacks from options
        return animation.progress( animation.opts.progress )
                .done( animation.opts.done, animation.opts.complete )
                .fail( animation.opts.fail )
                .always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
        var index, name, easing, value, hooks;

        // camelCase, specialEasing and expand cssHook pass
        for ( index in props ) {
                name = jQuery.camelCase( index );
                easing = specialEasing[ name ];
                value = props[ index ];
                if ( jQuery.isArray( value ) ) {
                        easing = value[ 1 ];
                        value = props[ index ] = value[ 0 ];
                }

                if ( index !== name ) {
                        props[ name ] = value;
                        delete props[ index ];
                }

                hooks = jQuery.cssHooks[ name ];
                if ( hooks && "expand" in hooks ) {
                        value = hooks.expand( value );
                        delete props[ name ];

                        // not quite $.extend, this wont overwrite keys already present.
                        // also - reusing 'index' from above because we have the correct "name"
                        for ( index in value ) {
                                if ( !( index in props ) ) {
                                        props[ index ] = value[ index ];
                                        specialEasing[ index ] = easing;
                                }
                        }
                } else {
                        specialEasing[ name ] = easing;
                }
        }
}

jQuery.Animation = jQuery.extend( Animation, {

        tweener: function( props, callback ) {
                if ( jQuery.isFunction( props ) ) {
                        callback = props;
                        props = [ "*" ];
                } else {
                        props = props.split(" ");
                }

                var prop,
                        index = 0,
                        length = props.length;

                for ( ; index < length ; index++ ) {
                        prop = props[ index ];
                        tweeners[ prop ] = tweeners[ prop ] || [];
                        tweeners[ prop ].unshift( callback );
                }
        },

        prefilter: function( callback, prepend ) {
                if ( prepend ) {
                        animationPrefilters.unshift( callback );
                } else {
                        animationPrefilters.push( callback );
                }
        }
});

function defaultPrefilter( elem, props, opts ) {
        var index, prop, value, length, dataShow, toggle, tween, hooks, oldfire,
                anim = this,
                style = elem.style,
                orig = {},
                handled = [],
                hidden = elem.nodeType && isHidden( elem );

        // handle queue: false promises
        if ( !opts.queue ) {
                hooks = jQuery._queueHooks( elem, "fx" );
                if ( hooks.unqueued == null ) {
                        hooks.unqueued = 0;
                        oldfire = hooks.empty.fire;
                        hooks.empty.fire = function() {
                                if ( !hooks.unqueued ) {
                                        oldfire();
                                }
                        };
                }
                hooks.unqueued++;

                anim.always(function() {
                        // doing this makes sure that the complete handler will be called
                        // before this completes
                        anim.always(function() {
                                hooks.unqueued--;
                                if ( !jQuery.queue( elem, "fx" ).length ) {
                                        hooks.empty.fire();
                                }
                        });
                });
        }

        // height/width overflow pass
        if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
                // Make sure that nothing sneaks out
                // Record all 3 overflow attributes because IE does not
                // change the overflow attribute when overflowX and
                // overflowY are set to the same value
                opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

                // Set display property to inline-block for height/width
                // animations on inline elements that are having width/height animated
                if ( jQuery.css( elem, "display" ) === "inline" &&
                                jQuery.css( elem, "float" ) === "none" ) {

                        // inline-level elements accept inline-block;
                        // block-level elements need to be inline with layout
                        if ( !jQuery.support.inlineBlockNeedsLayout || css_defaultDisplay( elem.nodeName ) === "inline" ) {
                                style.display = "inline-block";

                        } else {
                                style.zoom = 1;
                        }
                }
        }

        if ( opts.overflow ) {
                style.overflow = "hidden";
                if ( !jQuery.support.shrinkWrapBlocks ) {
                        anim.done(function() {
                                style.overflow = opts.overflow[ 0 ];
                                style.overflowX = opts.overflow[ 1 ];
                                style.overflowY = opts.overflow[ 2 ];
                        });
                }
        }


        // show/hide pass
        for ( index in props ) {
                value = props[ index ];
                if ( rfxtypes.exec( value ) ) {
                        delete props[ index ];
                        toggle = toggle || value === "toggle";
                        if ( value === ( hidden ? "hide" : "show" ) ) {
                                continue;
                        }
                        handled.push( index );
                }
        }

        length = handled.length;
        if ( length ) {
                dataShow = jQuery._data( elem, "fxshow" ) || jQuery._data( elem, "fxshow", {} );
                if ( "hidden" in dataShow ) {
                        hidden = dataShow.hidden;
                }

                // store state if its toggle - enables .stop().toggle() to "reverse"
                if ( toggle ) {
                        dataShow.hidden = !hidden;
                }
                if ( hidden ) {
                        jQuery( elem ).show();
                } else {
                        anim.done(function() {
                                jQuery( elem ).hide();
                        });
                }
                anim.done(function() {
                        var prop;
                        jQuery.removeData( elem, "fxshow", true );
                        for ( prop in orig ) {
                                jQuery.style( elem, prop, orig[ prop ] );
                        }
                });
                for ( index = 0 ; index < length ; index++ ) {
                        prop = handled[ index ];
                        tween = anim.createTween( prop, hidden ? dataShow[ prop ] : 0 );
                        orig[ prop ] = dataShow[ prop ] || jQuery.style( elem, prop );

                        if ( !( prop in dataShow ) ) {
                                dataShow[ prop ] = tween.start;
                                if ( hidden ) {
                                        tween.end = tween.start;
                                        tween.start = prop === "width" || prop === "height" ? 1 : 0;
                                }
                        }
                }
        }
}

function Tween( elem, options, prop, end, easing ) {
        return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
        constructor: Tween,
        init: function( elem, options, prop, end, easing, unit ) {
                this.elem = elem;
                this.prop = prop;
                this.easing = easing || "swing";
                this.options = options;
                this.start = this.now = this.cur();
                this.end = end;
                this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
        },
        cur: function() {
                var hooks = Tween.propHooks[ this.prop ];

                return hooks && hooks.get ?
                        hooks.get( this ) :
                        Tween.propHooks._default.get( this );
        },
        run: function( percent ) {
                var eased,
                        hooks = Tween.propHooks[ this.prop ];

                if ( this.options.duration ) {
                        this.pos = eased = jQuery.easing[ this.easing ](
                                percent, this.options.duration * percent, 0, 1, this.options.duration
                        );
                } else {
                        this.pos = eased = percent;
                }
                this.now = ( this.end - this.start ) * eased + this.start;

                if ( this.options.step ) {
                        this.options.step.call( this.elem, this.now, this );
                }

                if ( hooks && hooks.set ) {
                        hooks.set( this );
                } else {
                        Tween.propHooks._default.set( this );
                }
                return this;
        }
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
        _default: {
                get: function( tween ) {
                        var result;

                        if ( tween.elem[ tween.prop ] != null &&
                                (!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
                                return tween.elem[ tween.prop ];
                        }

                        // passing any value as a 4th parameter to .css will automatically
                        // attempt a parseFloat and fallback to a string if the parse fails
                        // so, simple values such as "10px" are parsed to Float.
                        // complex values such as "rotate(1rad)" are returned as is.
                        result = jQuery.css( tween.elem, tween.prop, false, "" );
                        // Empty strings, null, undefined and "auto" are converted to 0.
                        return !result || result === "auto" ? 0 : result;
                },
                set: function( tween ) {
                        // use step hook for back compat - use cssHook if its there - use .style if its
                        // available and use plain properties where available
                        if ( jQuery.fx.step[ tween.prop ] ) {
                                jQuery.fx.step[ tween.prop ]( tween );
                        } else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
                                jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
                        } else {
                                tween.elem[ tween.prop ] = tween.now;
                        }
                }
        }
};

// Remove in 2.0 - this supports IE8's panic based approach
// to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
        set: function( tween ) {
                if ( tween.elem.nodeType && tween.elem.parentNode ) {
                        tween.elem[ tween.prop ] = tween.now;
                }
        }
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
        var cssFn = jQuery.fn[ name ];
        jQuery.fn[ name ] = function( speed, easing, callback ) {
                return speed == null || typeof speed === "boolean" ||
                        // special check for .toggle( handler, handler, ... )
                        ( !i && jQuery.isFunction( speed ) && jQuery.isFunction( easing ) ) ?
                        cssFn.apply( this, arguments ) :
                        this.animate( genFx( name, true ), speed, easing, callback );
        };
});

jQuery.fn.extend({
        fadeTo: function( speed, to, easing, callback ) {

                // show any hidden elements after setting opacity to 0
                return this.filter( isHidden ).css( "opacity", 0 ).show()

                        // animate to the value specified
                        .end().animate({ opacity: to }, speed, easing, callback );
        },
        animate: function( prop, speed, easing, callback ) {
                var empty = jQuery.isEmptyObject( prop ),
                        optall = jQuery.speed( speed, easing, callback ),
                        doAnimation = function() {
                                // Operate on a copy of prop so per-property easing won't be lost
                                var anim = Animation( this, jQuery.extend( {}, prop ), optall );

                                // Empty animations resolve immediately
                                if ( empty ) {
                                        anim.stop( true );
                                }
                        };

                return empty || optall.queue === false ?
                        this.each( doAnimation ) :
                        this.queue( optall.queue, doAnimation );
        },
        stop: function( type, clearQueue, gotoEnd ) {
                var stopQueue = function( hooks ) {
                        var stop = hooks.stop;
                        delete hooks.stop;
                        stop( gotoEnd );
                };

                if ( typeof type !== "string" ) {
                        gotoEnd = clearQueue;
                        clearQueue = type;
                        type = undefined;
                }
                if ( clearQueue && type !== false ) {
                        this.queue( type || "fx", [] );
                }

                return this.each(function() {
                        var dequeue = true,
                                index = type != null && type + "queueHooks",
                                timers = jQuery.timers,
                                data = jQuery._data( this );

                        if ( index ) {
                                if ( data[ index ] && data[ index ].stop ) {
                                        stopQueue( data[ index ] );
                                }
                        } else {
                                for ( index in data ) {
                                        if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
                                                stopQueue( data[ index ] );
                                        }
                                }
                        }

                        for ( index = timers.length; index--; ) {
                                if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
                                        timers[ index ].anim.stop( gotoEnd );
                                        dequeue = false;
                                        timers.splice( index, 1 );
                                }
                        }

                        // start the next in the queue if the last step wasn't forced
                        // timers currently will call their complete callbacks, which will dequeue
                        // but only if they were gotoEnd
                        if ( dequeue || !gotoEnd ) {
                                jQuery.dequeue( this, type );
                        }
                });
        }
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
        var which,
                attrs = { height: type },
                i = 0;

        // if we include width, step value is 1 to do all cssExpand values,
        // if we don't include width, step value is 2 to skip over Left and Right
        includeWidth = includeWidth? 1 : 0;
        for( ; i < 4 ; i += 2 - includeWidth ) {
                which = cssExpand[ i ];
                attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
        }

        if ( includeWidth ) {
                attrs.opacity = attrs.width = type;
        }

        return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
        slideDown: genFx("show"),
        slideUp: genFx("hide"),
        slideToggle: genFx("toggle"),
        fadeIn: { opacity: "show" },
        fadeOut: { opacity: "hide" },
        fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
        jQuery.fn[ name ] = function( speed, easing, callback ) {
                return this.animate( props, speed, easing, callback );
        };
});

jQuery.speed = function( speed, easing, fn ) {
        var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
                complete: fn || !fn && easing ||
                        jQuery.isFunction( speed ) && speed,
                duration: speed,
                easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
        };

        opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
                opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

        // normalize opt.queue - true/undefined/null -> "fx"
        if ( opt.queue == null || opt.queue === true ) {
                opt.queue = "fx";
        }

        // Queueing
        opt.old = opt.complete;

        opt.complete = function() {
                if ( jQuery.isFunction( opt.old ) ) {
                        opt.old.call( this );
                }

                if ( opt.queue ) {
                        jQuery.dequeue( this, opt.queue );
                }
        };

        return opt;
};

jQuery.easing = {
        linear: function( p ) {
                return p;
        },
        swing: function( p ) {
                return 0.5 - Math.cos( p*Math.PI ) / 2;
        }
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
        var timer,
                timers = jQuery.timers,
                i = 0;

        fxNow = jQuery.now();

        for ( ; i < timers.length; i++ ) {
                timer = timers[ i ];
                // Checks the timer has not already been removed
                if ( !timer() && timers[ i ] === timer ) {
                        timers.splice( i--, 1 );
                }
        }

        if ( !timers.length ) {
                jQuery.fx.stop();
        }
        fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
        if ( timer() && jQuery.timers.push( timer ) && !timerId ) {
                timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
        }
};

jQuery.fx.interval = 13;

jQuery.fx.stop = function() {
        clearInterval( timerId );
        timerId = null;
};

jQuery.fx.speeds = {
        slow: 600,
        fast: 200,
        // Default speed
        _default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
        jQuery.expr.filters.animated = function( elem ) {
                return jQuery.grep(jQuery.timers, function( fn ) {
                        return elem === fn.elem;
                }).length;
        };
}
var rroot = /^(?:body|html)$/i;

jQuery.fn.offset = function( options ) {
        if ( arguments.length ) {
                return options === undefined ?
                        this :
                        this.each(function( i ) {
                                jQuery.offset.setOffset( this, options, i );
                        });
        }

        var docElem, body, win, clientTop, clientLeft, scrollTop, scrollLeft,
                box = { top: 0, left: 0 },
                elem = this[ 0 ],
                doc = elem && elem.ownerDocument;

        if ( !doc ) {
                return;
        }

        if ( (body = doc.body) === elem ) {
                return jQuery.offset.bodyOffset( elem );
        }

        docElem = doc.documentElement;

        // Make sure it's not a disconnected DOM node
        if ( !jQuery.contains( docElem, elem ) ) {
                return box;
        }

        // If we don't have gBCR, just use 0,0 rather than error
        // BlackBerry 5, iOS 3 (original iPhone)
        if ( typeof elem.getBoundingClientRect !== "undefined" ) {
                box = elem.getBoundingClientRect();
        }
        win = getWindow( doc );
        clientTop  = docElem.clientTop  || body.clientTop  || 0;
        clientLeft = docElem.clientLeft || body.clientLeft || 0;
        scrollTop  = win.pageYOffset || docElem.scrollTop;
        scrollLeft = win.pageXOffset || docElem.scrollLeft;
        return {
                top: box.top  + scrollTop  - clientTop,
                left: box.left + scrollLeft - clientLeft
        };
};

jQuery.offset = {

        bodyOffset: function( body ) {
                var top = body.offsetTop,
                        left = body.offsetLeft;

                if ( jQuery.support.doesNotIncludeMarginInBodyOffset ) {
                        top  += parseFloat( jQuery.css(body, "marginTop") ) || 0;
                        left += parseFloat( jQuery.css(body, "marginLeft") ) || 0;
                }

                return { top: top, left: left };
        },

        setOffset: function( elem, options, i ) {
                var position = jQuery.css( elem, "position" );

                // set position first, in-case top/left are set even on static elem
                if ( position === "static" ) {
                        elem.style.position = "relative";
                }

                var curElem = jQuery( elem ),
                        curOffset = curElem.offset(),
                        curCSSTop = jQuery.css( elem, "top" ),
                        curCSSLeft = jQuery.css( elem, "left" ),
                        calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
                        props = {}, curPosition = {}, curTop, curLeft;

                // need to be able to calculate position if either top or left is auto and position is either absolute or fixed
                if ( calculatePosition ) {
                        curPosition = curElem.position();
                        curTop = curPosition.top;
                        curLeft = curPosition.left;
                } else {
                        curTop = parseFloat( curCSSTop ) || 0;
                        curLeft = parseFloat( curCSSLeft ) || 0;
                }

                if ( jQuery.isFunction( options ) ) {
                        options = options.call( elem, i, curOffset );
                }

                if ( options.top != null ) {
                        props.top = ( options.top - curOffset.top ) + curTop;
                }
                if ( options.left != null ) {
                        props.left = ( options.left - curOffset.left ) + curLeft;
                }

                if ( "using" in options ) {
                        options.using.call( elem, props );
                } else {
                        curElem.css( props );
                }
        }
};


jQuery.fn.extend({

        position: function() {
                if ( !this[0] ) {
                        return;
                }

                var elem = this[0],

                // Get *real* offsetParent
                offsetParent = this.offsetParent(),

                // Get correct offsets
                offset       = this.offset(),
                parentOffset = rroot.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

                // Subtract element margins
                // note: when an element has margin: auto the offsetLeft and marginLeft
                // are the same in Safari causing offset.left to incorrectly be 0
                offset.top  -= parseFloat( jQuery.css(elem, "marginTop") ) || 0;
                offset.left -= parseFloat( jQuery.css(elem, "marginLeft") ) || 0;

                // Add offsetParent borders
                parentOffset.top  += parseFloat( jQuery.css(offsetParent[0], "borderTopWidth") ) || 0;
                parentOffset.left += parseFloat( jQuery.css(offsetParent[0], "borderLeftWidth") ) || 0;

                // Subtract the two offsets
                return {
                        top:  offset.top  - parentOffset.top,
                        left: offset.left - parentOffset.left
                };
        },

        offsetParent: function() {
                return this.map(function() {
                        var offsetParent = this.offsetParent || document.body;
                        while ( offsetParent && (!rroot.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static") ) {
                                offsetParent = offsetParent.offsetParent;
                        }
                        return offsetParent || document.body;
                });
        }
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
        var top = /Y/.test( prop );

        jQuery.fn[ method ] = function( val ) {
                return jQuery.access( this, function( elem, method, val ) {
                        var win = getWindow( elem );

                        if ( val === undefined ) {
                                return win ? (prop in win) ? win[ prop ] :
                                        win.document.documentElement[ method ] :
                                        elem[ method ];
                        }

                        if ( win ) {
                                win.scrollTo(
                                        !top ? val : jQuery( win ).scrollLeft(),
                                         top ? val : jQuery( win ).scrollTop()
                                );

                        } else {
                                elem[ method ] = val;
                        }
                }, method, val, arguments.length, null );
        };
});

function getWindow( elem ) {
        return jQuery.isWindow( elem ) ?
                elem :
                elem.nodeType === 9 ?
                        elem.defaultView || elem.parentWindow :
                        false;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
        jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
                // margin is only for outerHeight, outerWidth
                jQuery.fn[ funcName ] = function( margin, value ) {
                        var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
                                extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

                        return jQuery.access( this, function( elem, type, value ) {
                                var doc;

                                if ( jQuery.isWindow( elem ) ) {
                                        // As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
                                        // isn't a whole lot we can do. See pull request at this URL for discussion:
                                        // https://github.com/jquery/jquery/pull/764
                                        return elem.document.documentElement[ "client" + name ];
                                }

                                // Get document width or height
                                if ( elem.nodeType === 9 ) {
                                        doc = elem.documentElement;

                                        // Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
                                        // unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
                                        return Math.max(
                                                elem.body[ "scroll" + name ], doc[ "scroll" + name ],
                                                elem.body[ "offset" + name ], doc[ "offset" + name ],
                                                doc[ "client" + name ]
                                        );
                                }

                                return value === undefined ?
                                        // Get width or height on the element, requesting but not forcing parseFloat
                                        jQuery.css( elem, type, value, extra ) :

                                        // Set width or height on the element
                                        jQuery.style( elem, type, value, extra );
                        }, type, chainable ? margin : undefined, chainable, null );
                };
        });
});
// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
        define( "jquery", [], function () { return jQuery; } );
}

})( window );

//     Underscore.js 1.5.1
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.1';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value == null ? _.identity : value);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var result;
    var timeout = null;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD define happens at the end for compatibility with AMD loaders
  // that don't enforce next-turn semantics on modules.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [],function() {
      return _;
    });
  }

}).call(this);

//     Backbone.js 1.0.0

//     (c) 2010-2013 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(root, factory) {
  // Set up Backbone appropriately for the environment.
  if (typeof exports !== 'undefined') {
    // Node/CommonJS, no need for jQuery in that case.
    factory(root, exports, require('underscore'));
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define('backbone',['underscore', 'jquery', 'exports'], function(_, $, exports) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backbone.
      root.Backbone = factory(root, exports, _, $);
    });
  } else {
    // Browser globals
    root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
  }
}(this, function(root, Backbone, _, $) {

  // Initial Setup
  // -------------

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create local references to array methods we'll want to use later.
  var array = [];
  var push = array.push;
  var slice = array.slice;
  var splice = array.splice;

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.0.0';

  // For Backbone's purposes, jQuery, Zepto, or Ender owns the `$` variable.
  Backbone.$ = $;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    on: function(name, callback, context) {
      if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
      this._events || (this._events = {});
      var events = this._events[name] || (this._events[name] = []);
      events.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }

      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (events = this._events[name]) {
          this._events[name] = retain = [];
          if (callback || context) {
            for (j = 0, k = events.length; j < k; j++) {
              ev = events[j];
              if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                  (context && context !== ev.context)) {
                retain.push(ev);
              }
            }
          }
          if (!retain.length) delete this._events[name];
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, arguments);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(obj, name, callback) {
      var listeners = this._listeners;
      if (!listeners) return this;
      var deleteListener = !name && !callback;
      if (typeof name === 'object') callback = this;
      if (obj) (listeners = {})[obj._listenerId] = obj;
      for (var id in listeners) {
        listeners[id].off(name, callback, this);
        if (deleteListener) delete this._listeners[id];
      }
      return this;
    }

  };

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;

    // Handle event maps.
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
      return false;
    }

    // Handle space separated event names.
    if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
      return false;
    }

    return true;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeners = this._listeners || (this._listeners = {});
      var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
      listeners[id] = obj;
      if (typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var defaults;
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    _.extend(this, _.pick(options, modelOptions));
    if (options.parse) attrs = this.parse(attrs, options) || {};
    if (defaults = _.result(this, 'defaults')) {
      attrs = _.defaults({}, attrs, defaults);
    }
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // A list of options to be attached directly to the model, if provided.
  var modelOptions = ['url', 'urlRoot', 'collection'];

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      var attr, attrs, unset, changes, silent, changing, prev, current;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      unset           = options.unset;
      silent          = options.silent;
      changes         = [];
      changing        = this._changing;
      this._changing  = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }
      current = this.attributes, prev = this._previousAttributes;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      // For each `set` attribute, update or delete the current value.
      for (attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          this.changed[attr] = val;
        } else {
          delete this.changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = true;
        for (var i = 0, l = changes.length; i < l; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server. If the server's representation of the
    // model differs from its current attributes, they will be overridden,
    // triggering a `"change"` event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        if (!model.set(model.parse(resp, options), options)) return false;
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, method, xhr, attributes = this.attributes;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      // If we're not waiting and attributes exist, save acts as `set(attr).save(null, opts)`.
      if (attrs && (!options || !options.wait) && !this.set(attrs, options)) return false;

      options = _.extend({validate: true}, options);

      // Do not persist invalid models.
      if (!this._validate(attrs, options)) return false;

      // Set temporary attributes if `{wait: true}`.
      if (attrs && options.wait) {
        this.attributes = _.extend({}, attributes, attrs);
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = model.parse(resp, options);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (_.isObject(serverAttrs) && !model.set(serverAttrs, options)) {
          return false;
        }
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch') options.attrs = attrs;
      xhr = this.sync(method, this, options);

      // Restore attributes.
      if (attrs && options.wait) this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }
      wrapError(this, options);

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || urlError();
      if (this.isNew()) return base;
      return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return this.id == null;
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options || {}, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model.
  var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit'];

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  _.each(modelMethods, function(method) {
    Model.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.attributes);
      return _[method].apply(_, args);
    };
  });

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analagous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.url) this.url = options.url;
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, merge: false, remove: false};

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
      return this.set(models, _.defaults(options || {}, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      models = _.isArray(models) ? models.slice() : [models];
      options || (options = {});
      var i, l, index, model;
      for (i = 0, l = models.length; i < l; i++) {
        model = this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byId[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model);
      }
      return this;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      options = _.defaults(options || {}, setOptions);
      if (options.parse) models = this.parse(models, options);
      if (!_.isArray(models)) models = models ? [models] : [];
      var i, l, model, attrs, existing, sort;
      var at = options.at;
      var sortable = this.comparator && (at == null) && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;
      var toAdd = [], toRemove = [], modelMap = {};

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (i = 0, l = models.length; i < l; i++) {
        if (!(model = this._prepareModel(models[i], options))) continue;

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing = this.get(model)) {
          if (options.remove) modelMap[existing.cid] = true;
          if (options.merge) {
            existing.set(model.attributes, options);
            if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
          }

        // This is a new model, push it to the `toAdd` list.
        } else if (options.add) {
          toAdd.push(model);

          // Listen to added models' events, and index models for lookup by
          // `id` and by `cid`.
          model.on('all', this._onModelEvent, this);
          this._byId[model.cid] = model;
          if (model.id != null) this._byId[model.id] = model;
        }
      }

      // Remove nonexistent models if appropriate.
      if (options.remove) {
        for (i = 0, l = this.length; i < l; ++i) {
          if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
        }
        if (toRemove.length) this.remove(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (toAdd.length) {
        if (sortable) sort = true;
        this.length += toAdd.length;
        if (at != null) {
          splice.apply(this.models, [at, 0].concat(toAdd));
        } else {
          push.apply(this.models, toAdd);
        }
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      if (options.silent) return this;

      // Trigger `add` events.
      for (i = 0, l = toAdd.length; i < l; i++) {
        (model = toAdd[i]).trigger('add', model, this, options);
      }

      // Trigger `sort` if the collection was sorted.
      if (sort) this.trigger('sort', this, options);
      return this;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options || (options = {});
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i]);
      }
      options.previousModels = this.models;
      this._reset();
      this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return this;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: this.length}, options));
      return model;
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: 0}, options));
      return model;
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function(begin, end) {
      return this.models.slice(begin, end);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj.id != null ? obj.id : obj.cid || obj];
    },

    // Get the model at the given index.
    at: function(index) {
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      if (_.isEmpty(attrs)) return first ? void 0 : [];
      return this[first ? 'find' : 'filter'](function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      // Run sort based on type of `comparator`.
      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Figure out the smallest index at which a model should be inserted so as
    // to maintain order.
    sortedIndex: function(model, value, context) {
      value || (value = this.comparator);
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _.sortedIndex(this.models, model, iterator, context);
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success(collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      if (!(model = this._prepareModel(model, options))) return false;
      if (!options.wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(resp) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models);
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options || (options = {});
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model._validate(attrs, options)) {
        this.trigger('invalid', this, attrs, options);
        return false;
      }
      return model;
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'toArray', 'size', 'first', 'head', 'take', 'initial', 'rest',
    'tail', 'drop', 'last', 'without', 'indexOf', 'shuffle', 'lastIndexOf',
    'isEmpty', 'chain'];

  // Mix in each Underscore method as a proxy to `Collection#models`.
  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.models);
      return _[method].apply(_, args);
    };
  });

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    this._configure(options || {});
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be prefered to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this.$el.remove();
      this.stopListening();
      return this;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save'
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) continue;

        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.on(eventName, method);
        } else {
          this.$el.on(eventName, selector, method);
        }
      }
      return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // Performs the initial configuration of a View with a set of options.
    // Keys with special meaning *(e.g. model, collection, id, className)* are
    // attached directly to the view.  See `viewOptions` for an exhaustive
    // list.
    _configure: function(options) {
      if (this.options) options = _.extend({}, _.result(this, 'options'), options);
      _.extend(this, _.pick(options, viewOptions));
      this.options = options;
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        var $el = Backbone.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
        this.setElement($el, false);
      } else {
        this.setElement(_.result(this, 'el'), false);
      }
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // If we're sending a `PATCH` request, and we're in an old Internet Explorer
    // that still has ActiveX enabled by default, override jQuery to use that
    // for XHR instead. Remove this line when jQuery supports `PATCH` on IE8.
    if (params.type === 'PATCH' && window.ActiveXObject &&
          !(window.external && window.external.msActiveXFilteringEnabled)) {
      params.xhr = function() {
        return new ActiveXObject("Microsoft.XMLHTTP");
      };
    }

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        callback && callback.apply(router, args);
        router.trigger.apply(router, ['route:' + name].concat(args));
        router.trigger('route', name, args);
        Backbone.history.trigger('route', router, name, args);
      });
      return this;
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional){
                     return optional ? match : '([^\/]+)';
                   })
                   .replace(splatParam, '(.*?)');
      return new RegExp('^' + route + '$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param) {
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for detecting MSIE.
  var isExplorer = /msie [\w.]+/;

  // Cached regex for removing a trailing slash.
  var trailingSlash = /\/$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the cross-browser normalized URL fragment, either from the URL,
    // the hash, or the override.
    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = this.location.pathname;
          var root = this.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({}, {root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      if (oldIE && this._wantsHashChange) {
        this.iframe = Backbone.$('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._hasPushState) {
        Backbone.$(window).on('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).on('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      // Determine if we need to change the base url, for a pushState link
      // opened by a non-pushState browser.
      this.fragment = fragment;
      var loc = this.location;
      var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

      // If we've started off with a route from a `pushState`-enabled browser,
      // but we're currently in a browser that doesn't support it...
      if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
        this.fragment = this.getFragment(null, true);
        this.location.replace(this.root + this.location.search + '#' + this.fragment);
        // Return immediately as browser will do redirect to new url
        return true;

      // Or if we've started out with a hash-based route, but we're currently
      // in a browser where it could be `pushState`-based instead...
      } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
        this.fragment = this.getHash().replace(routeStripper, '');
        this.history.replaceState({}, document.title, this.root + this.fragment + loc.search);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      Backbone.$(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
      clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl() || this.loadUrl(this.getHash());
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragmentOverride) {
      var fragment = this.fragment = this.getFragment(fragmentOverride);
      var matched = _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
      return matched;
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: options};
      fragment = this.getFragment(fragment || '');
      if (this.fragment === fragment) return;
      this.fragment = fragment;
      var url = this.root + fragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function (model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error(model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

  return Backbone;
}));

/**
 * FTScroller: touch and mouse-based scrolling for DOM elements larger than their containers.
 *
 * While this is a rewrite, it is heavily inspired by two projects:
 * 1) Uxebu TouchScroll (https://github.com/davidaurelio/TouchScroll), BSD licensed:
 *    Copyright (c) 2010 uxebu Consulting Ltd. & Co. KG
 *    Copyright (c) 2010 David Aurelio
 * 2) Zynga Scroller (https://github.com/zynga/scroller), MIT licensed:
 *    Copyright 2011, Zynga Inc.
 *    Copyright 2011, Deutsche Telekom AG
 *
 * Includes CubicBezier:
 *
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2010 David Aurelio. All Rights Reserved.
 * Copyright (C) 2010 uxebu Consulting Ltd. & Co. KG. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC., DAVID AURELIO, AND UXEBU
 * CONSULTING LTD. & CO. KG ``AS IS'' AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL APPLE INC. OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @copyright The Financial Times Ltd [All rights reserved]
 * @codingstandard ftlabs-jslint
 * @version 0.2.0
 */
/**
 * @license FTScroller is (c) 2012 The Financial Times Ltd [All rights reserved] and licensed under the MIT license.
 *
 * Inspired by Uxebu TouchScroll, (c) 2010 uxebu Consulting Ltd. & Co. KG and David Aurelio, which is BSD licensed (https://github.com/davidaurelio/TouchScroll)
 * Inspired by Zynga Scroller, (c) 2011 Zynga Inc and Deutsche Telekom AG, which is MIT licensed (https://github.com/zynga/scroller)
 * Includes CubicBezier, (c) 2008 Apple Inc [All rights reserved], (c) 2010 David Aurelio and uxebu Consulting Ltd. & Co. KG. [All rights reserved], which is 2-clause BSD licensed (see above or https://github.com/davidaurelio/TouchScroll).
 */

/*jslint nomen: true, vars: true, browser: true, node: true, es5: true, continue: true, white: true*/
/*globals FTScrollerOptions*/

var FTScroller, CubicBezier;

(function () {
	

	// Global flag to determine if any scroll is currently active.  This prevents
	// issues when using multiple scrollers, particularly when they're nested.
	var _ftscrollerMoving = false;

	// Determine whether pointer events or touch events can be used
	var _trackPointerEvents = window.navigator.msPointerEnabled;
	var _trackTouchEvents = !_trackPointerEvents && (window.propertyIsEnumerable('ontouchstart') || window.document.hasOwnProperty('ontouchstart'));

	// Determine whether to use modern hardware acceleration rules or dynamic/toggleable rules.
	// Certain older browsers - particularly Android browsers - have problems with hardware
	// acceleration, so being able to toggle the behaviour dynamically via a CSS cascade is desirable.
	var _useToggleableHardwareAcceleration = !window.hasOwnProperty('ArrayBuffer');

	// Feature detection
	var _canClearSelection = (window.Selection && window.Selection.prototype.removeAllRanges);

	// Determine the browser engine and prefix, trying to use the unprefixed version where available.
	var _vendorCSSPrefix, _vendorStylePropertyPrefix, _vendorTransformLookup;
	if (document.createElement('div').style.transform !== undefined) {
		_vendorCSSPrefix = '';
		_vendorStylePropertyPrefix = '';
		_vendorTransformLookup = 'transform';
	} else if (window.opera && Object.prototype.toString.call(window.opera) === '[object Opera]') {
		_vendorCSSPrefix = '-o-';
		_vendorStylePropertyPrefix = 'O';
		_vendorTransformLookup = 'OTransform';
	} else if (document.documentElement.style.MozTransform !== undefined) {
		_vendorCSSPrefix = '-moz-';
		_vendorStylePropertyPrefix = 'Moz';
		_vendorTransformLookup = 'MozTransform';
	} else if (document.documentElement.style.webkitTransform !== undefined) {
		_vendorCSSPrefix = '-webkit-';
		_vendorStylePropertyPrefix = 'webkit';
		_vendorTransformLookup = '-webkit-transform';
	} else if (typeof navigator.cpuClass === 'string') {
		_vendorCSSPrefix = '-ms-';
		_vendorStylePropertyPrefix = 'ms';
		_vendorTransformLookup = '-ms-transform';
	}

	// If hardware acceleration is using the standard path, but perspective doesn't seem to be supported,
	// 3D transforms likely aren't supported either
	if (!_useToggleableHardwareAcceleration && document.createElement('div').style[_vendorStylePropertyPrefix + (_vendorStylePropertyPrefix ? 'P' : 'p') + 'erspective'] === undefined) {
		_useToggleableHardwareAcceleration = true;
	}

	// Style prefixes
	var _transformProperty = _vendorStylePropertyPrefix + (_vendorStylePropertyPrefix ? 'T' : 't') + 'ransform';
	var _transitionProperty = _vendorStylePropertyPrefix + (_vendorStylePropertyPrefix ? 'T' : 't') + 'ransition';
	var _translateRulePrefix = _useToggleableHardwareAcceleration ? 'translate(' : 'translate3d(';
	var _transformPrefixes = { x: '', y: '0,' };
	var _transformSuffixes = { x: ',0' + (_useToggleableHardwareAcceleration ? ')' : ',0)'), y: (_useToggleableHardwareAcceleration ? ')' : ',0)') };

	// Constants.  Note that the bezier curve should be changed along with the friction!
	var _kFriction = 0.998;
	var _kMinimumSpeed = 0.01;

	// Create a global stylesheet to set up stylesheet rules and track dynamic entries
	(function () {
		var stylesheetContainerNode = document.getElementsByTagName('head')[0] || document.documentElement;
		var newStyleNode = document.createElement('style');
		var hardwareAccelerationRule;
		var _styleText;
		newStyleNode.type = 'text/css';

		// Determine the hardware acceleration logic to use
		if (_useToggleableHardwareAcceleration) {
			hardwareAccelerationRule = _vendorCSSPrefix + 'transform-style: preserve-3d;';
		} else {
			hardwareAccelerationRule = _vendorCSSPrefix + 'transform: translateZ(0);';
		}

		// Add our rules
		_styleText = [
			'.ftscroller_scrolling { ' + _vendorCSSPrefix + 'user-select: none; cursor: all-scroll !important }',
			'.ftscroller_container { overflow: hidden; position: relative; max-height: 100%; -webkit-tap-highlight-color: rgba(0, 0, 0, 0); -ms-touch-action: none }',
			'.ftscroller_hwaccelerated { ' + hardwareAccelerationRule  + ' }',
			'.ftscroller_x, .ftscroller_y { position: relative; min-width: 100%; min-height: 100%; overflow: hidden }',
			'.ftscroller_x { display: inline-block }',
			'.ftscroller_scrollbar { pointer-events: none; position: absolute; width: 5px; height: 5px; border: 1px solid rgba(255, 255, 255, 0.15); -webkit-border-radius: 3px; border-radius: 6px; opacity: 0; ' + _vendorCSSPrefix + 'transition: opacity 350ms; z-index: 10 }',
			'.ftscroller_scrollbarx { bottom: 2px; left: 2px }',
			'.ftscroller_scrollbary { right: 2px; top: 2px }',
			'.ftscroller_scrollbarinner { height: 100%; background: rgba(0,0,0,0.5); -webkit-border-radius: 2px; border-radius: 4px / 6px }',
			'.ftscroller_scrolling .ftscroller_scrollbar { opacity: 1; ' + _vendorCSSPrefix + 'transition: none; -o-transition: all 0 none }',
			'.ftscroller_scrolling .ftscroller_container .ftscroller_scrollbar { opacity: 0 }'
		];

		if (newStyleNode.styleSheet) {
			newStyleNode.styleSheet.cssText = _styleText.join('\n');
		} else {
			newStyleNode.appendChild(document.createTextNode(_styleText.join('\n')));
		}

		// Add the stylesheet
		stylesheetContainerNode.insertBefore(newStyleNode, stylesheetContainerNode.firstChild);
	}());

	/**
	 * Master constructor for the scrolling function, including which element to
	 * construct the scroller in, and any scrolling options.
	 * Note that app-wide options can also be set using a global FTScrollerOptions
	 * object.
	 */
	FTScroller = function (domNode, options) {
		var key;
		var destroy, setSnapSize, scrollTo, scrollBy, updateDimensions, addEventListener, removeEventListener, _startScroll, _updateScroll, _endScroll, _finalizeScroll, _interruptScroll, _flingScroll, _snapScroll, _getSnapPositionForPosition, _initializeDOM, _existingDOMValid, _domChanged, _updateDimensions, _updateScrollbarDimensions, _updateElementPosition, _updateSegments, _setAxisPosition, _scheduleAxisPosition, _fireEvent, _childFocused, _modifyDistanceBeyondBounds, _distancesBeyondBounds, _startAnimation, _scheduleRender, _cancelAnimation, _toggleEventHandlers, _onTouchStart, _onTouchMove, _onTouchEnd, _onMouseDown, _onMouseMove, _onMouseUp, _onPointerDown, _onPointerMove, _onPointerUp, _onPointerCancel, _onPointerCaptureEnd, _onClick, _onMouseScroll, _captureInput, _releaseInputCapture, _getBoundingRect;


		/* Note that actual object instantiation occurs at the end of the closure to avoid jslint errors */


		/*                         Options                       */

		var _instanceOptions = {

			// Whether to display scrollbars as appropriate
			scrollbars: true,

			// Enable scrolling on the X axis if content is available
			scrollingX: true,

			// Enable scrolling on the Y axis if content is available
			scrollingY: true,

			// The initial movement required to trigger a scroll, in pixels; this is the point at which
			// the scroll is exclusive to this particular FTScroller instance.
			scrollBoundary: 1,

			// The initial movement required to trigger a visual indication that scrolling is occurring,
			// in pixels.  This is enforced to be less than or equal to the scrollBoundary, and is used to
			// define when the scroller starts drawing changes in response to an input, even if the scroll
			// is not treated as having begun/locked yet.
			scrollResponseBoundary: 1,

			// Whether to always enable scrolling, even if the content of the scroller does not
			// require the scroller to function.  This makes the scroller behave more like an
			// element set to "overflow: scroll", with bouncing always occurring if enabled.
			alwaysScroll: false,

			// The content width to use when determining scroller dimensions.  If this
			// is false, the width will be detected based on the actual content.
			contentWidth: undefined,

			// The content height to use when determining scroller dimensions.  If this
			// is false, the height will be detected based on the actual content.
			contentHeight: undefined,

			// Enable snapping of content to 'pages' or a pixel grid
			snapping: false,

			// Define the horizontal interval of the pixel grid; snapping must be enabled for this to
			// take effect.  If this is not defined, snapping will use intervals based on container size.
			snapSizeX: undefined,

			// Define the vertical interval of the pixel grid; snapping must be enabled for this to
			// take effect.  If this is not defined, snapping will use intervals based on container size.
			snapSizeY: undefined,

			// Control whether snapping should be fully paginated, only ever flicking to the next page
			// and not beyond.  Snapping needs to be enabled for this to take effect.
			paginatedSnap: false,

			// Allow scroll bouncing and elasticity near the ends and grid
			bouncing: true,

			// Automatically detects changes to the contained markup and
			// updates its dimensions whenever the content changes. This is
			// set to false if a contentWidth or contentHeight are supplied.
			updateOnChanges: true,

			// Automatically catches changes to the window size and updates
			// its dimensions.
			updateOnWindowResize: false,

			// The alignment to use if the content is smaller than the container;
			// this also applies to initial positioning of scrollable content.
			// Valid alignments are -1 (top or left), 0 (center), and 1 (bottom or right).
			baseAlignments: { x: -1, y: -1 },

			// Whether to use a window scroll flag, eg window.foo, to control whether
			// to allow scrolling to start or now.  If the window flag is set to true,
			// this element will not start scrolling; this element will also toggle
			// the variable while scrolling
			windowScrollingActiveFlag: undefined,

			// Instead of always using translate3d for transforms, a mix of translate3d
			// and translate with a hardware acceleration class used to trigger acceleration
			// is used; this is to allow CSS inheritance to be used to allow dynamic
			// disabling of backing layers on older platforms.
			hwAccelerationClass: 'ftscroller_hwaccelerated',

			// While use of requestAnimationFrame is highly recommended on platforms
			// which support it, it can result in the animation being a further half-frame
			// behind the input method, increasing perceived lag slightly.  To disable this,
			// set this property to false.
			enableRequestAnimationFrameSupport: true,

			// Set the maximum time (ms) that a fling can take to complete; if
			// this is not set, flings will complete instantly
			maxFlingDuration: 1000
		};


		/*                     Local variables                   */

		// Cache the DOM node and set up variables for other nodes
		var _publicSelf;
		var _self = this;
		var _scrollableMasterNode = domNode;
		var _containerNode;
		var _contentParentNode;
		var _scrollNodes = { x: null, y: null };
		var _scrollbarNodes = { x: null, y: null };

		// Dimensions of the container element and the content element
		var _metrics = {
			container: { x: null, y: null },
			content: { x: null, y: null, rawX: null, rawY: null },
			scrollEnd: { x: null, y: null }
		};

		// Snapping details
		var _snapGridSize = {
			x: false,
			y: false,
			userX: false,
			userY: false
		};
		var _baseSegment = { x: 0, y: 0 };
		var _activeSegment = { x: 0, y: 0 };

		// Track the identifier of any input being tracked
		var _inputIdentifier = false;
		var _inputIndex = 0;
		var _inputCaptured = false;

		// Current scroll positions and tracking
		var _isScrolling = false;
		var _isDisplayingScroll = false;
		var _isAnimating = false;
		var _scrollbarsVisible = false;
		var _baseScrollPosition = { x: 0, y: 0 };
		var _lastScrollPosition = { x: 0, y: 0 };
		var _scrollAtExtremity = { x: null, y: null };
		var _preventClick = false;
		var _timeouts = [];
		var _hasBeenScrolled = false;

		// Gesture details
		var _baseScrollableAxes = {};
		var _scrollableAxes = { x: true, y: true };
		var _gestureStart = { x: 0, y: 0, t: 0 };
		var _cumulativeScroll = { x: 0, y: 0 };
		var _eventHistory = [];
		var _kFlingBezier = new CubicBezier(0.1, 0.4, 0.3, 1);
		var _kBounceBezier = new CubicBezier(0.7, 0, 0.9, 0.6);
		var _kFlingTruncatedBezier = _kFlingBezier.divideAtT(0.97)[0];
		var _kDecelerateBezier = new CubicBezier(0, 0.5, 0.5, 1);

		// Allow certain events to be debounced
		var _domChangeDebouncer = false;
		var _scrollWheelEndDebouncer = false;

		// Performance switches on browsers supporting requestAnimationFrame
		var _animationFrameRequest = false;
		var _animationTargetPosition = { x: 0, y: 0 };
		var _reqAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || false;
		var _cancelAnimationFrame = window.cancelAnimationFrame || window.cancelRequestAnimationFrame || window.mozCancelAnimationFrame || window.mozCancelRequestAnimationFrame || window.webkitCancelAnimationFrame || window.webkitCancelRequestAnimationFrame || window.msCancelAnimationFrame || window.msCancelRequestAnimationFrame || false;

		// Event listeners
		var _eventListeners = {
			'scrollstart': [],
			'scroll': [],
			'scrollend': [],
			'segmentwillchange': [],
			'segmentdidchange': [],
			'reachedstart': [],
			'reachedend': [],
			'scrollinteractionend': []
		};

		// MutationObserver instance, when supported and if DOM change sniffing is enabled
		var _mutationObserver;


		/* Parsing supplied options */

		// Override default instance options with global - or closure'd - options
		if (typeof FTScrollerOptions === 'object' && FTScrollerOptions) {
			for (key in FTScrollerOptions) {
				if (FTScrollerOptions.hasOwnProperty(key) && _instanceOptions.hasOwnProperty(key)) {
					_instanceOptions[key] = FTScrollerOptions[key];
				}
			}
		}

		// Override default and global options with supplied options
		if (options) {
			for (key in options) {
				if (options.hasOwnProperty(key) && _instanceOptions.hasOwnProperty(key)) {
					_instanceOptions[key] = options[key];
				}
			}

			// If snap grid size options were supplied, store them
			if (options.hasOwnProperty('snapSizeX') && Object.prototype.toString.call(options.snapSizeX) == '[object Array]') {
				_snapGridSize.userX = _snapGridSize.x = options.snapSizeX;

			}
			if (options.hasOwnProperty('snapSizeY') && Object.prototype.toString.call(options.snapSizeY) == '[object Array]') {
				_snapGridSize.userY = _snapGridSize.y = options.snapSizeY;
			}

			// If content width and height were defined, disable updateOnChanges for performance
			if (options.contentWidth && options.contentHeight) {
				options.updateOnChanges = false;
			}
		}

		// Validate the scroll response parameter
		_instanceOptions.scrollResponseBoundary = Math.min(_instanceOptions.scrollBoundary, _instanceOptions.scrollResponseBoundary);

		// Update base scrollable axes
		if (_instanceOptions.scrollingX) {
			_baseScrollableAxes.x = true;
		}
		if (_instanceOptions.scrollingY) {
			_baseScrollableAxes.y = true;
		}


		/*                    Scoped Functions                   */

		/**
		 * Unbinds all event listeners to prevent circular references preventing items
		 * from being deallocated, and clean up references to dom elements. Pass in
		 * "removeElements" to also remove FTScroller DOM elements for special reuse cases.
		 */
		destroy = function destroy(removeElements) {
			var i, l;

			_toggleEventHandlers(false);
			_cancelAnimation();
			if (_domChangeDebouncer) {
				window.clearTimeout(_domChangeDebouncer);
				_domChangeDebouncer = false;
			}
			for (i = 0, l = _timeouts.length; i < l; i = i + 1) {
				window.clearTimeout(_timeouts[i]);
			}
			_timeouts.length = 0;

			// Destroy DOM elements if required
			if (removeElements && _scrollableMasterNode) {
				while (_contentParentNode.firstChild) {
					_scrollableMasterNode.appendChild(_contentParentNode.firstChild);
				}
				_scrollableMasterNode.removeChild(_containerNode);
			}

			_scrollableMasterNode = null;
			_containerNode = null;
			_contentParentNode = null;
			_scrollNodes.x = null;
			_scrollNodes.y = null;
			_scrollbarNodes.x = null;
			_scrollbarNodes.y = null;
			for (i in _eventListeners) {
				if (_eventListeners.hasOwnProperty(i)) {
					_eventListeners[i].length = 0;
				}
			}

			// If this is currently tracked as a scrolling instance, clear the flag
			if (_ftscrollerMoving && _ftscrollerMoving === _self) {
				_ftscrollerMoving = false;
				if (_instanceOptions.windowScrollingActiveFlag) {
					window[_instanceOptions.windowScrollingActiveFlag] = false;
				}
			}
		};

		/**
		 * Configures the snapping boundaries within the scrolling element if
		 * snapping is active.  If this is never called, snapping defaults to
		 * using the bounding box, eg page-at-a-time.
		 */
		setSnapSize = function setSnapSize(width, height) {
			console.error('setSnapSize');
			_snapGridSize.userX = width;
			_snapGridSize.userY = height;
			_snapGridSize.x = width;
			_snapGridSize.y = height;

			// Ensure the content dimensions conform to the grid
			_metrics.content.x = Math.ceil(_metrics.content.rawX / width) * width;
			_metrics.content.y = Math.ceil(_metrics.content.rawY / height) * height;
			_metrics.scrollEnd.x = _metrics.container.x - _metrics.content.x;
			_metrics.scrollEnd.y = _metrics.container.y - _metrics.content.y;
			_updateScrollbarDimensions();

			// Snap to the new grid if necessary
			_snapScroll();
			_updateSegments(true);
		};

		/**
		 * Scroll to a supplied position, including whether or not to animate the
		 * scroll and how fast to perform the animation (pass in true to select a
		 * dynamic duration).  The inputs will be constrained to bounds and snapped.
		 * If false is supplied for a position, that axis will not be scrolled.
		 */
		scrollTo = function scrollTo(left, top, animationDuration) {
			var targetPosition, duration, positions, axis, maxDuration = 0, scrollPositionsToApply = {};

			// If a manual scroll is in progress, cancel it
			_endScroll(Date.now());

			// Move supplied coordinates into an object for iteration, also inverting the values into
			// our coordinate system
			positions = {
				x: -left,
				y: -top
			};

			for (axis in _baseScrollableAxes) {
				if (_baseScrollableAxes.hasOwnProperty(axis)) {
					targetPosition = positions[axis];
					if (targetPosition === false) {
						continue;
					}

					// Constrain to bounds
					targetPosition = Math.min(0, Math.max(_metrics.scrollEnd[axis], targetPosition));

					// Snap if appropriate
					if (_instanceOptions.snapping && _snapGridSize[axis]) {
						targetPosition = Math.round(targetPosition / _snapGridSize[axis]) * _snapGridSize[axis];
					}

					// Get a duration
					duration = animationDuration || 0;
					if (duration === true) {
						duration = Math.sqrt(Math.abs(_baseScrollPosition[axis] - targetPosition)) * 20;
					}

					// Trigger the position change
					_setAxisPosition(axis, targetPosition, duration);
					scrollPositionsToApply[axis] = targetPosition;
					maxDuration = Math.max(maxDuration, duration);
				}
			}

			// If the scroll had resulted in a change in position, perform some additional actions:
			if (_baseScrollPosition.x !== positions.x || _baseScrollPosition.y !== positions.y) {

				// Mark a scroll as having ever occurred
				_hasBeenScrolled = true;

				// If an animation duration is present, fire a scroll start event
				_fireEvent('scrollstart', { scrollLeft: -_baseScrollPosition.x, scrollTop: -_baseScrollPosition.y });
			}

			if (maxDuration) {
				_timeouts.push(setTimeout(function () {
					var axis;
					for (axis in scrollPositionsToApply) {
						if (scrollPositionsToApply.hasOwnProperty(axis)) {
							_lastScrollPosition[axis] = scrollPositionsToApply[axis];
						}
					}
					_finalizeScroll();
				}, maxDuration));
			} else {
				_finalizeScroll();
			}

			_fireEvent('scroll', { scrollLeft: -_baseScrollPosition.x, scrollTop: -_baseScrollPosition.y });
		};

		/**
		 * Alter the current scroll position, including whether or not to animate
		 * the scroll and how fast to perform the animation (pass in true to
		 * select a dynamic duration).  The inputs will be checked against the
		 * current position.
		 */
		scrollBy = function scrollBy(horizontal, vertical, animationDuration) {

			// Wrap the scrollTo function for simplicity
			scrollTo(parseFloat(horizontal) - _baseScrollPosition.x, parseFloat(vertical) - _baseScrollPosition.y, animationDuration);
		};

		/**
		 * Provide a public method to detect changes in dimensions for either the content or the
		 * container.
		 */
		updateDimensions = function updateDimensions(contentWidth, contentHeight, ignoreSnapScroll) {
			options.contentWidth = contentWidth || options.contentWidth;
			options.contentHeight = contentHeight || options.contentHeight;

			// Currently just wrap the private API
			_updateDimensions(!!ignoreSnapScroll);
		};

		/**
		 * Add an event handler for a supported event.  Current events include:
		 * scroll - fired whenever the scroll position changes
		 * scrollstart - fired when a scroll movement starts
		 * scrollend - fired when a scroll movement ends
		 * segmentwillchange - fired whenever the segment changes, including during scrolling
		 * segmentdidchange - fired when a segment has conclusively changed, after scrolling.
		 */
		addEventListener = function addEventListener(eventname, eventlistener) {

			// Ensure this is a valid event
			if (!_eventListeners.hasOwnProperty(eventname)) {
				return false;
			}

			// Add the listener
			_eventListeners[eventname].push(eventlistener);
			return true;
		};

		/**
		 * Remove an event handler for a supported event.  The listener must be exactly the same as
		 * an added listener to be removed.
		 */
		removeEventListener = function removeEventListener(eventname, eventlistener) {
			var i;

			// Ensure this is a valid event
			if (!_eventListeners.hasOwnProperty(eventname)) {
				return false;
			}

			for (i = _eventListeners[eventname].length; i >= 0; i = i - 1) {
				if (_eventListeners[eventname][i] === eventlistener) {
					_eventListeners[eventname].splice(i, 1);
				}
			}
			return true;
		};

		/**
		 * Start a scroll tracking input - this could be mouse, webkit-style touch,
		 * or ms-style pointer events.
		 */
		_startScroll = function _startScroll(inputX, inputY, inputTime, rawEvent) {
			var triggerScrollInterrupt = _isAnimating;

			// Opera fix
			if (inputTime <= 0) {
				inputTime = Date.now();
			}

			// If a window scrolling flag is set, and evaluates to true, don't start checking touches
			if (_instanceOptions.windowScrollingActiveFlag && window[_instanceOptions.windowScrollingActiveFlag]) {
				return false;
			}

			// If an animation is in progress, stop the scroll.
			if (triggerScrollInterrupt) {
				_interruptScroll();
			} else {

				// Allow clicks again, but only if a scroll was not interrupted
				_preventClick = false;
			}

			// Store the initial event coordinates
			_gestureStart.x = inputX;
			_gestureStart.y = inputY;
			_gestureStart.t = inputTime;
			_animationTargetPosition.x = _lastScrollPosition.x;
			_animationTargetPosition.y = _lastScrollPosition.y;

			// Clear event history and add the start touch
			_eventHistory.length = 0;
			_eventHistory.push({ x: inputX, y: inputY, t: inputTime });

			if (triggerScrollInterrupt) {
				_updateScroll(inputX, inputY, inputTime, rawEvent, triggerScrollInterrupt);
			}

			return true;
		};

		/**
		 * Continue a scroll as a result of an updated position
		 */
		_updateScroll = function _updateScroll(inputX, inputY, inputTime, rawEvent, scrollInterrupt) {
			var axis, otherScrollerActive;
			var initialScroll = false;
			var gesture = {
				x: inputX - _gestureStart.x,
				y: inputY - _gestureStart.y
			};
			var targetPositions = { x: _baseScrollPosition.x + gesture.x, y: _baseScrollPosition.y + gesture.y };
			var distancesBeyondBounds = _distancesBeyondBounds(targetPositions);

			// Opera fix
			if (inputTime <= 0) {
				inputTime = Date.now();
			}

			// If scrolling has not yet locked to this scroller, check whether to stop scrolling
			if (!_isScrolling) {

				// Check the internal flag to determine if another FTScroller is scrolling
				if (_ftscrollerMoving && _ftscrollerMoving !== _self) {
					otherScrollerActive = true;
				}

				// Otherwise, check the window scrolling flag to see if anything else has claimed scrolling
				else if (_instanceOptions.windowScrollingActiveFlag && window[_instanceOptions.windowScrollingActiveFlag]) {
					otherScrollerActive = true;
				}

				// If another scroller was active, clean up and stop processing.
				if (otherScrollerActive) {
					_inputIdentifier = false;
					_releaseInputCapture();
					if (_scrollbarsVisible) {
						_cancelAnimation();
						if (!_snapScroll(true)) {
							_finalizeScroll(true);
						}
					}
					return;
				}
			}

			// If not yet displaying a scroll, determine whether that triggering boundary
			// has been exceeded
			if (!_isDisplayingScroll) {

				// Determine whether to prevent the default scroll event - if the scroll could still
				// be triggered, prevent the default to avoid problems (particularly on PlayBook)
				if (_instanceOptions.bouncing || scrollInterrupt || (_scrollableAxes.x && gesture.x && distancesBeyondBounds.x < 0) || (_scrollableAxes.y && gesture.y && distancesBeyondBounds.y < 0)) {
					rawEvent.preventDefault();
				}

				// Check scrolled distance against the boundary limit to see if scrolling can be triggered.
				// If snapping is active and the scroll has been interrupted, trigger at once
				if (!(scrollInterrupt && _instanceOptions.snapping) && (!_scrollableAxes.x || Math.abs(gesture.x) < _instanceOptions.scrollResponseBoundary) && (!_scrollableAxes.y || Math.abs(gesture.y) < _instanceOptions.scrollResponseBoundary)) {
					return;
				}

				// If bouncing is disabled, and already at an edge and scrolling beyond the edge, ignore the scroll for
				// now - this allows other scrollers to claim if appropriate, allowing nicer nested scrolls.
				if (!_instanceOptions.bouncing && !scrollInterrupt && (!_scrollableAxes.x || !gesture.x || distancesBeyondBounds.x > 0) && (!_scrollableAxes.y || !gesture.y || distancesBeyondBounds.y > 0)) {

					// Prevent the original click now that scrolling would be triggered
					_preventClick = true;

					return;
				}

				// Trigger the start of visual scrolling
				_startAnimation();
				_isDisplayingScroll = true;
				_hasBeenScrolled = true;
				_isAnimating = true;
				initialScroll = true;
				_scrollbarsVisible = true;
			} else {

				// Prevent the event default.  It is safe to call this in IE10 because the event is never
				// a window.event, always a "true" event.
				rawEvent.preventDefault();
			}

			// If not yet locked to a scroll, determine whether to do so
			if (!_isScrolling) {

				// If the gesture distance has exceeded the scroll lock distance, or snapping is active
				// and the scroll has been interrupted, enture exclusive scrolling.
				if ((scrollInterrupt && _instanceOptions.snapping) || (_scrollableAxes.x && Math.abs(gesture.x) >= _instanceOptions.scrollBoundary) || (_scrollableAxes.y && Math.abs(gesture.y) >= _instanceOptions.scrollBoundary)) {

					_isScrolling = true;
					_ftscrollerMoving = _self;
					if (_instanceOptions.windowScrollingActiveFlag) {
						window[_instanceOptions.windowScrollingActiveFlag] = _self;
					}
					_fireEvent('scrollstart', { scrollLeft: -_baseScrollPosition.x, scrollTop: -_baseScrollPosition.y });
				}
			}

			// Cancel text selections while dragging a cursor
			if (_canClearSelection) {
				window.getSelection().removeAllRanges();
			}

			// Update axes if appropriate
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					if (targetPositions[axis] > 0) {
						targetPositions[axis] = _modifyDistanceBeyondBounds(targetPositions[axis], axis);
					} else if (targetPositions[axis] < _metrics.scrollEnd[axis]) {
						targetPositions[axis] = _metrics.scrollEnd[axis] + _modifyDistanceBeyondBounds(targetPositions[axis] - _metrics.scrollEnd[axis], axis);
					}

					if (_reqAnimationFrame) {
						_animationTargetPosition[axis] = targetPositions[axis];
					} else {
						_setAxisPosition(axis, targetPositions[axis]);
					}
				}
			}

			// To aid render/draw coalescing, perform other one-off actions here
			if (initialScroll) {
				if (_containerNode.className.indexOf('ftscroller_scrolling') === -1) {
					_containerNode.className += ' ftscroller_scrolling';
				}
			}

			// If full, locked scrolling has enabled, fire any scroll and segment change events
			if (_isScrolling) {
				_fireEvent('scroll', { scrollLeft: -targetPositions.x, scrollTop: -targetPositions.y });
				_updateSegments(false);
			}

			// Add an event to the event history, keeping it around twenty events long
			_eventHistory.push({ x: inputX, y: inputY, t: inputTime });
			if (_eventHistory.length > 30) {
				_eventHistory.splice(0, 15);
			}
		};

		/**
		 * Complete a scroll with a final event time if available (it may
		 * not be, depending on the input type); this may continue the scroll
		 * with a fling and/or bounceback depending on options.
		 */
		_endScroll = function _endScroll(inputTime, rawEvent) {
			_inputIdentifier = false;
			_releaseInputCapture();
			_cancelAnimation();

			_fireEvent('scrollinteractionend', {});

			if (!_isScrolling) {
				if (!_snapScroll(true) && _scrollbarsVisible) {
					_finalizeScroll(true);
				}
				return;
			}

			// Modify the last movement event to include the end event time
			_eventHistory[_eventHistory.length - 1].t = inputTime;

			// Update flags
			_isScrolling = false;
			_isDisplayingScroll = false;
			_ftscrollerMoving = false;
			if (_instanceOptions.windowScrollingActiveFlag) {
				window[_instanceOptions.windowScrollingActiveFlag] = false;
			}

			// Prevent clicks and stop the event default.  It is safe to call this in IE10 because
			// the event is never a window.event, always a "true" event.
			_preventClick = true;
			if (rawEvent) {
				rawEvent.preventDefault();
			}

			// Trigger a fling or bounceback if necessary
			if (!_flingScroll() && !_snapScroll()) {
				_finalizeScroll();
			}
		};

		/**
		 * Remove the scrolling class, cleaning up display.
		 */
		_finalizeScroll = function _finalizeScroll(scrollCancelled) {
			var i, l, axis;

			_isAnimating = false;
			_scrollbarsVisible = false;
			_isDisplayingScroll = false;

			// Remove scrolling class
			_containerNode.className = _containerNode.className.replace(/ ?ftscroller_scrolling/g, '');

			// Store final position if scrolling occurred
			_baseScrollPosition.x = _lastScrollPosition.x;
			_baseScrollPosition.y = _lastScrollPosition.y;

			if (!scrollCancelled) {
				_fireEvent('scroll', { scrollLeft: -_baseScrollPosition.x, scrollTop: -_baseScrollPosition.y });
				_updateSegments(true);
				_fireEvent('scrollend', { scrollLeft: -_baseScrollPosition.x, scrollTop: -_baseScrollPosition.y });
			}

			// Restore transitions
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					_scrollNodes[axis].style[_transitionProperty] = '';
					if (_instanceOptions.scrollbars) {
						_scrollbarNodes[axis].style[_transitionProperty] = '';
					}
				}
			}

			// Clear any remaining timeouts
			for (i = 0, l = _timeouts.length; i < l; i = i + 1) {
				window.clearTimeout(_timeouts[i]);
			}
			_timeouts.length = 0;
		};

		/**
		 * Interrupt a current scroll, allowing a start scroll during animation to trigger a new scroll
		 */
		_interruptScroll = function _interruptScroll() {
			var axis, i, l;

			_isAnimating = false;

			// Update the stored base position
			_updateElementPosition();

			// Ensure the parsed positions are set, also clearing transitions
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					_setAxisPosition(axis, _baseScrollPosition[axis]);
				}
			}

			// Update segment tracking if snapping is active
			_updateSegments(false);

			// Clear any remaining timeouts
			for (i = 0, l = _timeouts.length; i < l; i = i + 1) {
				window.clearTimeout(_timeouts[i]);
			}
			_timeouts.length = 0;
		};

		/**
		 * Determine whether a scroll fling or bounceback is required, and set up the styles and
		 * timeouts required.
		 */
		_flingScroll = function _flingScroll() {
			var i, axis, movementSpeed, lastPosition, comparisonPosition, flingDuration, flingDistance, flingPosition, bounceDelay, bounceDistance, bounceDuration, bounceTarget, boundsBounce, modifiedDistance, flingBezier, timeProportion, boundsCrossDelay, flingStartSegment, beyondBoundsFlingDistance, baseFlingComponent;
			var maxAnimationTime = 0;
			var moveRequired = false;
			var scrollPositionsToApply = {};

			// If we only have the start event available, or are scrolling, no action required.
			if (_eventHistory.length === 1 || _inputIdentifier === 'scrollwheel') {
				return false;
			}

			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					bounceDuration = 350;
					bounceDistance = 0;
					boundsBounce = false;
					bounceTarget = false;
					boundsCrossDelay = undefined;

					// Re-set a default bezier curve for the animation, with the end lopped off for min speed
					flingBezier = _kFlingTruncatedBezier;

					// Get the last movement speed, in pixels per millisecond.  To do this, look at the events
					// in the last 100ms and average out the speed, using a minimum number of two points.
					lastPosition = _eventHistory[_eventHistory.length - 1];
					comparisonPosition = _eventHistory[_eventHistory.length - 2];
					for (i = _eventHistory.length - 3; i >= 0; i = i - 1) {
						if (lastPosition.t - _eventHistory[i].t > 100) {
							break;
						}
						comparisonPosition = _eventHistory[i];
					}
					movementSpeed = (lastPosition[axis] - comparisonPosition[axis]) / (lastPosition.t - comparisonPosition.t);

					// If there is little speed, no further action required except for a bounceback, below.
					if (Math.abs(movementSpeed) < _kMinimumSpeed) {
						flingDuration = 0;
						flingDistance = 0;

					} else {


						/* Calculate the fling duration.  As per TouchScroll, the speed at any particular
						point in time can be calculated as:
							{ speed } = { initial speed } * ({ friction } to the power of { duration })
						...assuming all values are in equal pixels/millisecond measurements.  As we know the
						minimum target speed, this can be altered to:
							{ duration } = log( { speed } / { initial speed } ) / log( { friction } )
						*/

						flingDuration = Math.log(_kMinimumSpeed / Math.abs(movementSpeed)) / Math.log(_kFriction);


						/* Calculate the fling distance (before any bouncing or snapping).  As per
						TouchScroll, the total distance covered can be approximated by summing
						the distance per millisecond, per millisecond of duration - a divergent series,
						and so rather tricky to model otherwise!
						So using values in pixels per millisecond:
							{ distance } = { initial speed } * (1 - ({ friction } to the power
								of { duration + 1 }) / (1 - { friction })
						*/

						flingDistance = movementSpeed * (1 - Math.pow(_kFriction, flingDuration + 1)) / (1 - _kFriction);
					}

					// Determine a target fling position
					flingPosition = Math.floor(_lastScrollPosition[axis] + flingDistance);

					// If bouncing is disabled, and the last scroll position and fling position are both at a bound,
					// reset the fling position to the bound
					if (!_instanceOptions.bouncing) {
						if (_lastScrollPosition[axis] === 0 && flingPosition > 0) {
							flingPosition = 0;
						} else if (_lastScrollPosition[axis] === _metrics.scrollEnd[axis] && flingPosition < _lastScrollPosition[axis]) {
							flingPosition = _lastScrollPosition[axis];
						}
					}

					// In paginated snapping mode, determine the page to snap to - maximum
					// one page in either direction from the current page.
					if (_instanceOptions.paginatedSnap && _instanceOptions.snapping) {
						flingStartSegment = -_lastScrollPosition[axis] / _snapGridSize[axis];
						if (_baseSegment[axis] < flingStartSegment) {
							flingStartSegment = Math.floor(flingStartSegment);
						} else {
							flingStartSegment = Math.ceil(flingStartSegment);
						}

						// If the target position will end up beyond another page, target that page edge
						if (flingPosition > -(flingStartSegment - 1) * _snapGridSize[axis]) {
							bounceDistance = flingPosition + (flingStartSegment - 1) * _snapGridSize[axis];
						} else if (flingPosition < -(flingStartSegment + 1) * _snapGridSize[axis]) {
							bounceDistance = flingPosition + (flingStartSegment + 1) * _snapGridSize[axis];

						// Otherwise, if the movement speed was above the minimum velocity, continue
						// in the move direction.
						} else if (Math.abs(movementSpeed) > _kMinimumSpeed) {

							// Determine the target segment
							if (movementSpeed < 0) {
								flingPosition = Math.floor(_lastScrollPosition[axis] / _snapGridSize[axis]) * _snapGridSize[axis];
							} else {
								flingPosition = Math.ceil(_lastScrollPosition[axis] / _snapGridSize[axis]) * _snapGridSize[axis];
							}

							flingDuration = Math.min(_instanceOptions.maxFlingDuration, flingDuration * (flingPosition - _lastScrollPosition[axis]) / flingDistance);
						}

					// In non-paginated snapping mode, snap to the nearest grid location to the target
					} else if (_instanceOptions.snapping) {
						bounceDistance = flingPosition - (Math.round(flingPosition / _snapGridSize[axis]) * _snapGridSize[axis]);
					}

					// Deal with cases where the target is beyond the bounds
					if (flingPosition - bounceDistance > 0) {
						bounceDistance = flingPosition;
						boundsBounce = true;
					} else if (flingPosition - bounceDistance < _metrics.scrollEnd[axis]) {
						bounceDistance = flingPosition - _metrics.scrollEnd[axis];
						boundsBounce = true;
					}

					// Amend the positions and bezier curve if necessary
					if (bounceDistance) {

						// If the fling moves the scroller beyond the normal scroll bounds, and
						// the bounce is snapping the scroll back after the fling:
						if (boundsBounce && _instanceOptions.bouncing && flingDistance) {
							flingDistance = Math.floor(flingDistance);

							if (flingPosition > 0) {
								beyondBoundsFlingDistance = flingPosition - Math.max(0, _lastScrollPosition[axis]);
							} else {
								beyondBoundsFlingDistance = flingPosition - Math.min(_metrics.scrollEnd[axis], _lastScrollPosition[axis]);
							}
							baseFlingComponent = flingDistance - beyondBoundsFlingDistance;

							// Determine the time proportion the original bound is along the fling curve
							if (!flingDistance || !flingDuration) {
								timeProportion = 0;
							} else {
								timeProportion = flingBezier._getCoordinateForT(flingBezier.getTForY((flingDistance - beyondBoundsFlingDistance) / flingDistance, 1 / flingDuration), flingBezier._p1.x, flingBezier._p2.x);
								boundsCrossDelay = timeProportion * flingDuration;
							}

							// Eighth the distance beyonds the bounds
							modifiedDistance = Math.ceil(beyondBoundsFlingDistance / 8);

							// Further limit the bounce to half the container dimensions
							if (Math.abs(modifiedDistance) > _metrics.container[axis] / 2) {
								if (modifiedDistance < 0) {
									modifiedDistance = -Math.floor(_metrics.container[axis] / 2);
								} else {
									modifiedDistance = Math.floor(_metrics.container[axis] / 2);
								}
							}

							if (flingPosition > 0) {
								bounceTarget = 0;
							} else {
								bounceTarget = _metrics.scrollEnd[axis];
							}

							// If the entire fling is a bounce, modify appropriately
							if (timeProportion === 0) {
								flingDuration = flingDuration / 6;
								flingPosition = _lastScrollPosition[axis] + baseFlingComponent + modifiedDistance;
								bounceDelay = flingDuration;

							// Otherwise, take a new curve and add it to the timeout stack for the bounce
							} else {

								// The new bounce delay is the pre-boundary fling duration, plus a
								// sixth of the post-boundary fling.
								bounceDelay = (timeProportion + ((1 - timeProportion) / 6)) * flingDuration;

								_scheduleAxisPosition(axis, (_lastScrollPosition[axis] + baseFlingComponent + modifiedDistance), ((1 - timeProportion) * flingDuration / 6), _kDecelerateBezier, boundsCrossDelay);

								// Modify the fling to match, clipping to prevent over-fling
								flingBezier = flingBezier.divideAtX(bounceDelay / flingDuration, 1 / flingDuration)[0];
								flingDuration = bounceDelay;
								flingPosition = (_lastScrollPosition[axis] + baseFlingComponent + modifiedDistance);
							}

						// If the fling requires snapping to a snap location, and the bounce needs to
						// reverse the fling direction after the fling completes:
						} else if ((flingDistance < 0 && bounceDistance < flingDistance) || (flingDistance > 0 && bounceDistance > flingDistance)) {

							// Shorten the original fling duration to reflect the bounce
							flingPosition = flingPosition - Math.floor(flingDistance / 2);
							bounceDistance = bounceDistance - Math.floor(flingDistance / 2);
							bounceDuration = Math.sqrt(Math.abs(bounceDistance)) * 50;
							bounceTarget = flingPosition - bounceDistance;
							flingDuration = 350;
							bounceDelay = flingDuration * 0.97;

						// If the bounce is truncating the fling, or continuing the fling on in the same
						// direction to hit the next boundary:
						} else {
							flingPosition = flingPosition - bounceDistance;

							// If there was no fling distance originally, use the bounce details
							if (!flingDistance) {
								flingDuration = bounceDuration;

							// If truncating the fling at a snapping edge:
							} else if ((flingDistance < 0 && bounceDistance < 0) || (flingDistance > 0 && bounceDistance > 0)) {
								timeProportion = flingBezier._getCoordinateForT(flingBezier.getTForY((Math.abs(flingDistance) - Math.abs(bounceDistance)) / Math.abs(flingDistance), 1 / flingDuration), flingBezier._p1.x, flingBezier._p2.x);
								flingBezier = flingBezier.divideAtX(timeProportion, 1 / flingDuration)[0];
								flingDuration = Math.round(flingDuration * timeProportion);

							// If extending the fling to reach the next snapping boundary, no further
							// action is required.
							}

							bounceDistance = 0;
							bounceDuration = 0;
						}
					}

					// If no fling or bounce is required, continue
					if (flingPosition === _lastScrollPosition[axis] && !bounceDistance) {
						continue;
					}
					moveRequired = true;

					// Perform the fling
					_setAxisPosition(axis, flingPosition, flingDuration, flingBezier, boundsCrossDelay);

					// Schedule a bounce if appropriate
					if (bounceDistance && bounceDuration) {
						_scheduleAxisPosition(axis, bounceTarget, bounceDuration, _kBounceBezier, bounceDelay);
					}

					maxAnimationTime = Math.max(maxAnimationTime, bounceDistance ? (bounceDelay + bounceDuration) : flingDuration);
					scrollPositionsToApply[axis] = (bounceTarget === false) ? flingPosition : bounceTarget;
				}
			}

			if (moveRequired && maxAnimationTime) {
				_timeouts.push(setTimeout(function () {
					var axis;

					// Update the stored scroll position ready for finalising
					for (axis in scrollPositionsToApply) {
						if (scrollPositionsToApply.hasOwnProperty(axis)) {
							_lastScrollPosition[axis] = scrollPositionsToApply[axis];
						}
					}

					_finalizeScroll();
				}, maxAnimationTime));
			}

			return moveRequired;
		};

		/**
		 * Bounce back into bounds if necessary, or snap to a grid location.
		 */
		_snapScroll = function _snapScroll(scrollCancelled) {
			var axis;
			var snapDuration = scrollCancelled ? 100 : 350;

			// Get the current position and see if a snap is required
			var targetPosition = _getSnapPositionForPosition(_lastScrollPosition);
			var snapRequired = false;
			for (axis in _baseScrollableAxes) {
				if (_baseScrollableAxes.hasOwnProperty(axis)) {
					if (targetPosition[axis] !== _lastScrollPosition[axis]) {
						snapRequired = true;
					}
				}
			}
			if (!snapRequired) {
				return false;
			}

			// Perform the snap
			for (axis in _baseScrollableAxes) {
				if (_baseScrollableAxes.hasOwnProperty(axis)) {
					_setAxisPosition(axis, targetPosition[axis], snapDuration);
				}
			}

			_timeouts.push(setTimeout(function () {

				// Update the stored scroll position ready for finalizing
				_lastScrollPosition = targetPosition;

				_finalizeScroll(scrollCancelled);
			}, snapDuration));

			return true;
		};

		/**
		 * Get an appropriate snap point for a supplied point.  This will respect the edge of the
		 * element, and any grid if configured.
		 */
		_getSnapPositionForPosition = function _getSnapPositionForPosition(coordinates) {
			var axis;
			var coordinatesToReturn = { x: 0, y: 0 };
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {

					// If the coordinate is beyond the edges of the scroller, use the closest edge
					if (coordinates[axis] > 0) {
						coordinatesToReturn[axis] = 0;
						continue;
					}
					if (coordinates[axis] < _metrics.scrollEnd[axis]) {
						coordinatesToReturn[axis] = _metrics.scrollEnd[axis];
						continue;
					}

					// If a grid is present, find the nearest grid delineator.
					if (_instanceOptions.snapping && _snapGridSize[axis]) {
						coordinatesToReturn[axis] = Math.round(coordinates[axis] / _snapGridSize[axis]) * _snapGridSize[axis];

						continue;
					}

					// Otherwise use the supplied coordinate.
					coordinatesToReturn[axis] = coordinates[axis];
				}
			}
					console.log(coordinatesToReturn);
			return coordinatesToReturn;
		};

		/**
		 * Sets up the DOM around the node to be scrolled.
		 */
		_initializeDOM = function _initializeDOM() {
			var offscreenFragment, offscreenNode, scrollYParent;

			// Check whether the DOM is already present and valid - if so, no further action required.
			if (_existingDOMValid()) {
				return;
			}

			// Otherwise, the DOM needs to be created inside the originally supplied node.  The node
			// has a container inserted inside it - which acts as an anchor element with constraints -
			// and then the scrollable layers as appropriate.

			// Create a new document fragment to temporarily hold the scrollable content
			offscreenFragment = _scrollableMasterNode.ownerDocument.createDocumentFragment();
			offscreenNode = document.createElement('DIV');
			offscreenFragment.appendChild(offscreenNode);

			// Drop in the wrapping HTML
			offscreenNode.innerHTML = FTScroller.prototype.getPrependedHTML(!_instanceOptions.scrollingX, !_instanceOptions.scrollingY, _instanceOptions.hwAccelerationClass) + FTScroller.prototype.getAppendedHTML(!_instanceOptions.scrollingX, !_instanceOptions.scrollingY, _instanceOptions.hwAccelerationClass, _instanceOptions.scrollbars);

			// Update references as appropriate
			_containerNode = offscreenNode.firstElementChild;
			scrollYParent = _containerNode;
			if (_instanceOptions.scrollingX) {
				_scrollNodes.x = _containerNode.firstElementChild;
				scrollYParent = _scrollNodes.x;
				if (_instanceOptions.scrollbars) {
					_scrollbarNodes.x = _containerNode.getElementsByClassName('ftscroller_scrollbarx')[0];
				}
			}
			if (_instanceOptions.scrollingY) {
				_scrollNodes.y = scrollYParent.firstElementChild;
				if (_instanceOptions.scrollbars) {
					_scrollbarNodes.y = _containerNode.getElementsByClassName('ftscroller_scrollbary')[0];
				}
				_contentParentNode = _scrollNodes.y;
			} else {
				_contentParentNode = _scrollNodes.x;
			}

			// Take the contents of the scrollable element, and copy them into the new container
			while (_scrollableMasterNode.firstChild) {
				_contentParentNode.appendChild(_scrollableMasterNode.firstChild);
			}

			// Move the wrapped elements back into the document
			_scrollableMasterNode.appendChild(_containerNode);
		};

		/**
		 * Attempts to use any existing DOM scroller nodes if possible, returning true if so;
		 * updates all internal element references.
		 */
		_existingDOMValid = function _existingDOMValid() {
			var scrollerContainer, layerX, layerY, yParent, scrollerX, scrollerY, candidates, i, l;

			// Check that there's an initial child node, and make sure it's the container class
			scrollerContainer = _scrollableMasterNode.firstElementChild;
			if (!scrollerContainer || scrollerContainer.className.indexOf('ftscroller_container') === -1) {
				return;
			}

			// If x-axis scrolling is enabled, find and verify the x scroller layer
			if (_instanceOptions.scrollingX) {

				// Find and verify the x scroller layer
				layerX = scrollerContainer.firstElementChild;
				if (!layerX || layerX.className.indexOf('ftscroller_x') === -1) {
					return;
				}
				yParent = layerX;

				// Find and verify the x scrollbar if enabled
				if (_instanceOptions.scrollbars) {
					candidates = scrollerContainer.getElementsByClassName('ftscroller_scrollbarx');
					if (candidates) {
						for (i = 0, l = candidates.length; i < l; i = i + 1) {
							if (candidates[i].parentNode === scrollerContainer) {
								scrollerX = candidates[i];
								break;
							}
						}
					}
					if (!scrollerX) {
						return;
					}
				}
			} else {
				yParent = scrollerContainer;
			}

			// If y-axis scrolling is enabled, find and verify the y scroller layer
			if (_instanceOptions.scrollingY) {

				// Find and verify the x scroller layer
				layerY = yParent.firstElementChild;
				if (!layerY || layerY.className.indexOf('ftscroller_y') === -1) {
					return;
				}

				// Find and verify the y scrollbar if enabled
				if (_instanceOptions.scrollbars) {
					candidates = scrollerContainer.getElementsByClassName('ftscroller_scrollbary');
					if (candidates) {
						for (i = 0, l = candidates.length; i < l; i = i + 1) {
							if (candidates[i].parentNode === scrollerContainer) {
								scrollerY = candidates[i];
								break;
							}
						}
					}
					if (!scrollerY) {
						return;
					}
				}
			}

			// Elements found and verified - update the references and return success
			_containerNode = scrollerContainer;
			if (layerX) {
				_scrollNodes.x = layerX;
			}
			if (layerY) {
				_scrollNodes.y = layerY;
			}
			if (scrollerX) {
				_scrollbarNodes.x = scrollerX;
			}
			if (scrollerY) {
				_scrollbarNodes.y = scrollerY;
			}
			if (_instanceOptions.scrollingY) {
				_contentParentNode = layerY;
			} else {
				_contentParentNode = layerX;
			}
			return true;
		};

		_domChanged = function _domChanged() {

			// If the timer is active, clear it
			if (_domChangeDebouncer) {
				window.clearTimeout(_domChangeDebouncer);
			}

			// Set up the DOM changed timer
			_domChangeDebouncer = setTimeout(function () {
				_updateDimensions();
			}, 100);
		};

		_sumDimensionGrid = function _sumDimensionGrid(grid) {
			var dimensions = { width: 0, height: 0};
			grid.forEach (function(el){
				dimensions.width += el.width;
				dimensions.height += el.height;
			});
			return dimensions;
		};

		_updateDimensions = function _updateDimensions(ignoreSnapScroll) {
			var axis;

			// Only update dimensions if the container node exists (DOM elements can go away if
			// the scroller instance is not destroyed correctly)
			if (!_containerNode || !_contentParentNode) {
				return false;
			}

			if (_domChangeDebouncer) {
				window.clearTimeout(_domChangeDebouncer);
				_domChangeDebouncer = false;
			}
			var containerWidth, containerHeight, startAlignments;

			// If a manual scroll is in progress, cancel it
			_endScroll(Date.now());

			// Calculate the starting alignment for comparison later
			startAlignments = { x: false, y: false };
			for (axis in startAlignments) {
				if (startAlignments.hasOwnProperty(axis)) {
					if (_lastScrollPosition[axis] === 0) {
						startAlignments[axis] = -1;
					} else if (_lastScrollPosition[axis] <= _metrics.scrollEnd[axis]) {
						startAlignments[axis] = 1;
					} else if (_lastScrollPosition[axis] * 2 <= _metrics.scrollEnd[axis] + 5 && _lastScrollPosition[axis] * 2 >= _metrics.scrollEnd[axis] - 5) {
						startAlignments[axis] = 0;
					}
				}
			}

			containerWidth = _containerNode.offsetWidth;
			containerHeight = _containerNode.offsetHeight;

			// Grab the dimensions
			// If snap grid size options were supplied, store them
			if (_snapGridSize.x ) {
				var rawScrollWidth = _sumDimensionGrid(_snapGridSize.x).width;
			}else {
				var rawScrollWidth = options.contentWidth || _contentParentNode.offsetWidth;

			}
			if (_snapGridSize.y ) {
				var rawScrollHeight = _sumDimensionGrid(_snapGridSize.y).height;
			}else {
				var rawScrollHeight = options.contentHeight || _contentParentNode.offsetHeight;
			}
			/*console.log(_snapGridSize.y);
			var test = _sumDimensionGrid(_snapGridSize.y);
			console.log(test);*/



			var scrollWidth = rawScrollWidth;
			var scrollHeight = rawScrollHeight;
			var targetPosition = { x: false, y: false };

			// Update snap grid
			console.error('Update snap grid', scrollHeight);
			if (!_snapGridSize.userX) {
				_snapGridSize.x = containerWidth;
			}
			if (!_snapGridSize.userY) {
				_snapGridSize.y = containerHeight;
			}

			// If there is a grid, conform to the grid
			/*if (_instanceOptions.snapping) {
				if (_snapGridSize.userX) {
					scrollWidth = Math.ceil(scrollWidth / _snapGridSize.userX) * _snapGridSize.userX;
				} else {
					scrollWidth = Math.ceil(scrollWidth / _snapGridSize.x) * _snapGridSize.x;
				}
				if (_snapGridSize.userY) {
					scrollHeight = Math.ceil(scrollHeight / _snapGridSize.userY) * _snapGridSize.userY;
				} else {
					scrollHeight = Math.ceil(scrollHeight / _snapGridSize.y) * _snapGridSize.y;
				}
			}*/

			console.log('_snapGridSize',_snapGridSize, 'scrollWidth', scrollWidth, 'scrollHeight', scrollHeight);

			// If no details have changed, return.
			if (_metrics.container.x === containerWidth && _metrics.container.y === containerHeight && _metrics.content.x === scrollWidth && _metrics.content.y === scrollHeight) {
				return;
			}

			// Update the sizes
			_metrics.container.x = containerWidth;
			_metrics.container.y = containerHeight;
			_metrics.content.x = scrollWidth;
			_metrics.content.rawX = rawScrollWidth;
			_metrics.content.y = scrollHeight;
			_metrics.content.rawY = rawScrollHeight;
			_metrics.scrollEnd.x = containerWidth - scrollWidth;
			_metrics.scrollEnd.y = containerHeight - scrollHeight;
console.log('_metrics', _metrics);
			_updateScrollbarDimensions();

			// Apply base alignment if appropriate
			for (axis in targetPosition) {
				if (targetPosition.hasOwnProperty(axis)) {

					// If the container is smaller than the content, determine whether to apply the
					// alignment.  This occurs if a scroll has never taken place, or if the position
					// was previously at the correct "end" and can be maintained.
					if (_metrics.container[axis] < _metrics.content[axis]) {
						if (_hasBeenScrolled && _instanceOptions.baseAlignments[axis] !== startAlignments[axis]) {
							continue;
						}
					}

					// Apply the alignment
					if (_instanceOptions.baseAlignments[axis] === 1) {
						targetPosition[axis] = _metrics.scrollEnd[axis];
					} else if (_instanceOptions.baseAlignments[axis] === 0) {
						targetPosition[axis] = Math.floor(_metrics.scrollEnd[axis] / 2);
					} else if (_instanceOptions.baseAlignments[axis] === -1) {
						targetPosition[axis] = 0;
					}
				}
			}
			if (_instanceOptions.scrollingX && targetPosition.x !== false) {
				_setAxisPosition('x', targetPosition.x, 0);
				_baseScrollPosition.x = targetPosition.x;
			}
			if (_instanceOptions.scrollingY && targetPosition.y !== false) {
				_setAxisPosition('y', targetPosition.y, 0);
				_baseScrollPosition.y = targetPosition.y;
			}

			// Ensure bounds are correct
			if (!ignoreSnapScroll && _snapScroll()) {
				_updateSegments(true);
			}
			console.log('targetPosition',targetPosition);
		};

		_updateScrollbarDimensions = function _updateScrollbarDimensions() {

			// Update scrollbar sizes
			if (_instanceOptions.scrollbars) {
				if (_instanceOptions.scrollingX) {
					_scrollbarNodes.x.style.width = Math.max(6, Math.round(_metrics.container.x * (_metrics.container.x / _metrics.content.x) - 4)) + 'px';
				}
				if (_instanceOptions.scrollingY) {
					_scrollbarNodes.y.style.height = Math.max(6, Math.round(_metrics.container.y * (_metrics.container.y / _metrics.content.y) - 4)) + 'px';
				}
			}

			// Update scroll caches
			_scrollableAxes = {};
			if (_instanceOptions.scrollingX && (_metrics.content.x > _metrics.container.x || _instanceOptions.alwaysScroll)) {
				_scrollableAxes.x = true;
			}
			if (_instanceOptions.scrollingY && (_metrics.content.y > _metrics.container.y || _instanceOptions.alwaysScroll)) {
				_scrollableAxes.y = true;
			}
		};

		_updateElementPosition = function _updateElementPosition() {
			var axis, computedStyle, splitStyle;

			// Retrieve the current position of each active axis.
			// Custom parsing is used instead of native matrix support for speed and for
			// backwards compatibility.
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					computedStyle = window.getComputedStyle(_scrollNodes[axis], null)[_vendorTransformLookup];
					splitStyle = computedStyle.split(', ');

					// For 2d-style transforms, pull out elements four or five
					if (splitStyle.length === 6) {
						_baseScrollPosition[axis] = parseInt(splitStyle[(axis === 'y') ? 5 : 4], 10);

					// For 3d-style transforms, pull out elements twelve or thirteen
					} else {
						_baseScrollPosition[axis] = parseInt(splitStyle[(axis === 'y') ? 13 : 12], 10);
					}
					_lastScrollPosition[axis] = _baseScrollPosition[axis];
				}
			}
		};

		_updateSegments = function _updateSegments(scrollFinalised) {
			var axis;
			var newSegment = { x: 0, y: 0 };

			// If snapping is disabled, return without any further action required
			if (!_instanceOptions.snapping) {
				return;
			}

			// Calculate the new segments
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {
					newSegment[axis] = Math.max(0, Math.min(Math.ceil(_metrics.content[axis] / _snapGridSize[axis]) - 1, Math.round(-_lastScrollPosition[axis] / _snapGridSize[axis])));
				}
			}

			// In all cases update the active segment if appropriate
			if (newSegment.x !== _activeSegment.x || newSegment.y !== _activeSegment.y) {
				_activeSegment.x = newSegment.x;
				_activeSegment.y = newSegment.y;
				_fireEvent('segmentwillchange', { segmentX: newSegment.x, segmentY: newSegment.y });
			}

			// If the scroll has been finalised, also update the base segment
			if (scrollFinalised) {
				if (newSegment.x !== _baseSegment.x || newSegment.y !== _baseSegment.y) {
					_baseSegment.x = newSegment.x;
					_baseSegment.y = newSegment.y;
					_fireEvent('segmentdidchange', { segmentX: newSegment.x, segmentY: newSegment.y });
				}
			}
			console.log('newSegment',newSegment,'_baseSegment', _baseSegment);
		};

		_setAxisPosition = function _setAxisPosition(axis, position, animationDuration, animationBezier, boundsCrossDelay) {
			var transitionCSSString, newPositionAtExtremity = null;

			// Only update position if the axis node exists (DOM elements can go away if
			// the scroller instance is not destroyed correctly)
			if (!_scrollNodes[axis]) {
				return false;
			}

			// Determine the transition property to apply to both the scroll element and the scrollbar
			if (animationDuration) {
				if (!animationBezier) {
					animationBezier = _kFlingTruncatedBezier;
				}

				transitionCSSString = _vendorCSSPrefix + 'transform ' + animationDuration + 'ms ' + animationBezier.toString();
			} else {
				transitionCSSString = '';
			}

			// Apply the transition property to elements
			_scrollNodes[axis].style[_transitionProperty] = transitionCSSString;
			if (_instanceOptions.scrollbars) {
				_scrollbarNodes[axis].style[_transitionProperty] = transitionCSSString;
			}

			// Update the positions
			_scrollNodes[axis].style[_transformProperty] = _translateRulePrefix + _transformPrefixes[axis] + position + 'px' + _transformSuffixes[axis];
			if (_instanceOptions.scrollbars) {
				_scrollbarNodes[axis].style[_transformProperty] = _translateRulePrefix + _transformPrefixes[axis] + (-position * _metrics.container[axis] / _metrics.content[axis]) + 'px' + _transformSuffixes[axis];
			}

			// Determine whether the scroll is at an extremity.
			if (position >= 0) {
				newPositionAtExtremity = 'start';
			} else if (position <= _metrics.scrollEnd[axis]) {
				newPositionAtExtremity = 'end';
			}

			// If the extremity status has changed, fire an appropriate event
			if (newPositionAtExtremity !== _scrollAtExtremity[axis]) {
				if (newPositionAtExtremity !== null) {
					if (animationDuration) {
						_timeouts.push(setTimeout(function() {
							_fireEvent('reached' + newPositionAtExtremity, { axis: axis });
						}, boundsCrossDelay || animationDuration));
					} else {
						_fireEvent('reached' + newPositionAtExtremity, { axis: axis });
					}
				}
				_scrollAtExtremity[axis] = newPositionAtExtremity;
			}

			// Update the recorded position if there's no duration
			if (!animationDuration) {
				_lastScrollPosition[axis] = position;
			}
		};

		_scheduleAxisPosition = function _scheduleAxisPosition(axis, position, animationDuration, animationBezier, afterDelay) {
			_timeouts.push(setTimeout(function () {
				_setAxisPosition(axis, position, animationDuration, animationBezier);
			}, afterDelay));
		};

		_fireEvent = function _fireEvent(eventName, eventObject) {
			var i, l;
			eventObject.srcObject = _publicSelf;

			// Iterate through any listeners
			for (i = 0, l = _eventListeners[eventName].length; i < l; i = i + 1) {

				// Execute each in a try/catch
				try {
					_eventListeners[eventName][i](eventObject);
				} catch (error) {
					if (window.console && window.console.error) {
						window.console.error(error.message + ' (' + error.sourceURL + ', line ' + error.line + ')');
					}
				}
			}
		};

		/**
		 * Update the scroll position so that the child element is in view.
		 */
		_childFocused = function _childFocused(event) {
			var offset, axis;
			var focusedNodeRect = _getBoundingRect(event.target);
			var containerRect = _getBoundingRect(_containerNode);
			var edgeMap = { x: 'left', y: 'top' };
			var dimensionMap = { x: 'width', y: 'height' };

			// If an input is currently being tracked, ignore the focus event
			if (_inputIdentifier !== false) {
				return;
			}

			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis)) {

					// Set the target offset to be in the middle of the container, or as close as bounds permit
					offset = -Math.round((focusedNodeRect[dimensionMap[axis]] / 2) - _lastScrollPosition[axis] + focusedNodeRect[edgeMap[axis]] - containerRect[edgeMap[axis]]  - (containerRect[dimensionMap[axis]] / 2));
					offset = Math.min(0, Math.max(_metrics.scrollEnd[axis], offset));

					// Perform the scroll
					_setAxisPosition(axis, offset, 0);
					_baseScrollPosition[axis] = offset;
				}
			}
		};

		/**
		 * Given a relative distance beyond the element bounds, returns a modified version to
		 * simulate bouncy/springy edges.
		 */
		_modifyDistanceBeyondBounds = function _modifyDistanceBeyondBounds(distance, axis) {
			if (!_instanceOptions.bouncing) {
				return 0;
			}
			var e = Math.exp(distance / _metrics.container[axis]);
			return Math.round(_metrics.container[axis] * 0.6 * (e - 1) / (e + 1));
		};

		/**
		 * Given positions for each enabled axis, returns an object showing how far each axis is beyond
		 * bounds. If within bounds, -1 is returned; if at the bounds, 0 is returned.
		 */
		_distancesBeyondBounds = function _distancesBeyondBounds(positions) {
			var axis, position;
			var distances = {};
			for (axis in positions) {
				if (positions.hasOwnProperty(axis)) {
					position = positions[axis];

					// If the position is to the left/top, no further modification required
					if (position >= 0) {
						distances[axis] = position;

					// If it's within the bounds, use -1
					} else if (position > _metrics.scrollEnd[axis]) {
						distances[axis] = -1;

					// Otherwise, amend by the distance of the maximum edge
					} else {
						distances[axis] = _metrics.scrollEnd[axis] - position;
					}
				}
			}
			return distances;
		};

		/**
		 * On platforms which support it, use RequestAnimationFrame to group
		 * position updates for speed.  Starts the render process.
		 */
		_startAnimation = function _startAnimation() {
			if (_reqAnimationFrame) {
				_cancelAnimation();
				_animationFrameRequest = _reqAnimationFrame(_scheduleRender);
			}
		};

		/**
		 * On platforms which support RequestAnimationFrame, provide the rendering loop.
		 * Takes two arguments; the first is the render/position update function to
		 * be called, and the second is a string controlling the render type to
		 * allow previous changes to be cancelled - should be 'pan' or 'scroll'.
		 */
		_scheduleRender = function _scheduleRender() {
			var axis;

			// Request the next update at once
			_animationFrameRequest = _reqAnimationFrame(_scheduleRender);

			// Perform the draw.
			for (axis in _scrollableAxes) {
				if (_scrollableAxes.hasOwnProperty(axis) && _animationTargetPosition[axis] !== _lastScrollPosition[axis]) {
					_setAxisPosition(axis, _animationTargetPosition[axis]);
				}
			}
		};

		/**
		 * Stops the animation process.
		 */
		_cancelAnimation = function _cancelAnimation() {
			if (_animationFrameRequest === false || !_cancelAnimationFrame) {
				return;
			}

			_cancelAnimationFrame(_animationFrameRequest);
			_animationFrameRequest = false;
		};

		/**
		 * Register or unregister event handlers as appropriate
		 */
		_toggleEventHandlers = function _toggleEventHandlers(enable) {
			var MutationObserver;

			// Only remove the event if the node exists (DOM elements can go away)
			if (!_containerNode) {
				return;
			}

			if (enable) {
				_containerNode._ftscrollerToggle = _containerNode.addEventListener;
			} else {
				_containerNode._ftscrollerToggle = _containerNode.removeEventListener;
			}

			if (_trackPointerEvents) {
				_containerNode._ftscrollerToggle('MSPointerDown', _onPointerDown, true);
				_containerNode._ftscrollerToggle('MSPointerMove', _onPointerMove, true);
				_containerNode._ftscrollerToggle('MSPointerUp', _onPointerUp, true);
				_containerNode._ftscrollerToggle('MSPointerCancel', _onPointerCancel, true);
			} else {
				if (_trackTouchEvents) {
					_containerNode._ftscrollerToggle('touchstart', _onTouchStart, true);
					_containerNode._ftscrollerToggle('touchmove', _onTouchMove, true);
					_containerNode._ftscrollerToggle('touchend', _onTouchEnd, true);
					_containerNode._ftscrollerToggle('touchcancel', _onTouchEnd, true);
				}
				_containerNode._ftscrollerToggle('mousedown', _onMouseDown, true);
				if (!enable) {
					document.removeEventListener('mousemove', _onMouseMove, true);
					document.removeEventListener('mouseup', _onMouseUp, true);
				}
			}
			_containerNode._ftscrollerToggle('DOMMouseScroll', _onMouseScroll, false);
			_containerNode._ftscrollerToggle('mousewheel', _onMouseScroll, false);

			// Add a click listener.  On IE, add the listener to the document, to allow
			// clicks to be cancelled if a scroll ends outside the bounds of the container; on
			// other platforms, add to the container node.
			if (_trackPointerEvents) {
				if (enable) {
					document.addEventListener('click', _onClick, true);
				} else {
					document.removeEventListener('click', _onClick, true);
				}
			} else {
				_containerNode._ftscrollerToggle('click', _onClick, true);
			}

			// Watch for changes inside the contained element to update bounds - de-bounced slightly.
			if (enable) {
				_contentParentNode.addEventListener('focus', _childFocused, true);
				if (_instanceOptions.updateOnChanges) {

					// Try and reuse the old, disconnected observer instance if available
					// Otherwise, check for support before proceeding
					if (!_mutationObserver) {
						MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window[_vendorStylePropertyPrefix + 'MutationObserver'];
						if (MutationObserver) {
							_mutationObserver = new MutationObserver(_domChanged);
						}
					}

					if (_mutationObserver) {
						_mutationObserver.observe(_contentParentNode, {
							childList: true,
							characterData: true,
							subtree: true
						});
					} else {
						_contentParentNode.addEventListener('DOMSubtreeModified', function (e) {


							// Ignore changes to nested FT Scrollers - even updating a transform style
							// can trigger a DOMSubtreeModified in IE, causing nested scrollers to always
							// favour the deepest scroller as parent scrollers 'resize'/end scrolling.
							if (e && (e.srcElement === _contentParentNode || e.srcElement.className.indexOf('ftscroller_') !== -1)) {
								return;
							}

							_domChanged();
						}, true);
					}
					_contentParentNode.addEventListener('load', _domChanged, true);
				}
				if (_instanceOptions.updateOnWindowResize) {
					window.addEventListener('resize', _domChanged, true);
				}
			} else {
				_contentParentNode.removeEventListener('focus', _childFocused, true);
				if (_mutationObserver) {
					_mutationObserver.disconnect();
				} else {
					_contentParentNode.removeEventListener('DOMSubtreeModified', _domChanged, true);
				}
				_contentParentNode.removeEventListener('load', _domChanged, true);
				window.removeEventListener('resize', _domChanged, true);
			}

			delete _containerNode._ftscrollerToggle;
		};

		/**
		 * Touch event handlers
		 */
		_onTouchStart = function _onTouchStart(startEvent) {
			var i, l, touchEvent;

			// If a touch is already active, ensure that the index
			// is mapped to the correct finger, and return.
			if (_inputIdentifier) {
				for (i = 0, l = startEvent.touches.length; i < l; i = i + 1) {
					if (startEvent.touches[i].identifier === _inputIdentifier) {
						_inputIndex = i;
					}
				}
				return;
			}

			// Track the new touch's identifier, reset index, and pass
			// the coordinates to the scroll start function.
			touchEvent = startEvent.touches[0];
			_inputIdentifier = touchEvent.identifier;
			_inputIndex = 0;
			_startScroll(touchEvent.clientX, touchEvent.clientY, startEvent.timeStamp, startEvent);
		};
		_onTouchMove = function _onTouchMove(moveEvent) {
			if (_inputIdentifier === false) {
				return;
			}

			// Get the coordinates from the appropriate touch event and
			// pass them on to the scroll handler
			var touchEvent = moveEvent.touches[_inputIndex];
			_updateScroll(touchEvent.clientX, touchEvent.clientY, moveEvent.timeStamp, moveEvent);
		};
		_onTouchEnd = function _onTouchEnd(endEvent) {
			var i, l;

			// Check whether the original touch event is still active,
			// if it is, update the index and return.
			if (endEvent.touches) {
				for (i = 0, l = endEvent.touches.length; i < l; i = i + 1) {
					if (endEvent.touches[i].identifier === _inputIdentifier) {
						_inputIndex = i;
						return;
					}
				}
			}

			// Complete the scroll.  Note that touch end events
			// don't capture coordinates.
			_endScroll(endEvent.timeStamp, endEvent);
		};

		/**
		 * Mouse event handlers
		 */
		_onMouseDown = function _onMouseDown(startEvent) {

			// Don't track the right mouse buttons, or a context menu
			if ((startEvent.button && startEvent.button === 2) || startEvent.ctrlKey) {
				return;
			}

			// Capture if possible
			if (_containerNode.setCapture) {
				_containerNode.setCapture();
			}

			// Add move & up handlers to the *document* to allow handling outside the element
			document.addEventListener('mousemove', _onMouseMove, true);
			document.addEventListener('mouseup', _onMouseUp, true);

			_inputIdentifier = startEvent.button || 1;
			_inputIndex = 0;
			_startScroll(startEvent.clientX, startEvent.clientY, startEvent.timeStamp, startEvent);
		};
		_onMouseMove = function _onMouseMove(moveEvent) {
			if (!_inputIdentifier) {
				return;
			}

			_updateScroll(moveEvent.clientX, moveEvent.clientY, moveEvent.timeStamp, moveEvent);
		};
		_onMouseUp = function _onMouseUp(endEvent) {
			if (endEvent.button && endEvent.button !== _inputIdentifier) {
				return;
			}

			document.removeEventListener('mousemove', _onMouseMove, true);
			document.removeEventListener('mouseup', _onMouseUp, true);

			// Release capture if possible
			if (_containerNode.releaseCapture) {
				_containerNode.releaseCapture();
			}

			_endScroll(endEvent.timeStamp, endEvent);
		};

		/**
		 * Pointer event handlers
		 */
		_onPointerDown = function _onPointerDown(startEvent) {

			// If there is already a pointer event being tracked, ignore subsequent.
			if (_inputIdentifier) {
				return;
			}

			_inputIdentifier = startEvent.pointerId;
			_captureInput();
			_startScroll(startEvent.clientX, startEvent.clientY, startEvent.timeStamp, startEvent);
		};
		_onPointerMove = function _onPointerMove(moveEvent) {
			if (_inputIdentifier !== moveEvent.pointerId) {
				return;
			}
			_updateScroll(moveEvent.clientX, moveEvent.clientY, moveEvent.timeStamp, moveEvent);
		};
		_onPointerUp = function _onPointerUp(endEvent) {
			if (_inputIdentifier !== endEvent.pointerId) {
				return;
			}

			_endScroll(endEvent.timeStamp, endEvent);
		};
		_onPointerCancel = function _onPointerCancel(endEvent) {
			_endScroll(endEvent.timeStamp, endEvent);
		};
		_onPointerCaptureEnd = function _onPointerCaptureEnd(event) {
			_endScroll(event.timeStamp, event);
		};


		/**
		 * Prevents click actions if appropriate
		 */
		_onClick = function _onClick(clickEvent) {

			// If a scroll action hasn't resulted in the next scroll being prevented, and a scroll
			// isn't currently in progress with a different identifier, allow the click
			if (!_preventClick && !_inputIdentifier) {
				return true;
			}

			// Prevent clicks using the preventDefault() and stopPropagation() handlers on the event;
			// this is safe even in IE10 as this is always a "true" event, never a window.event.
			clickEvent.preventDefault();
			clickEvent.stopPropagation();
			if (!_inputIdentifier) {
				_preventClick = false;
			}
			return false;
		};


		/**
		 * Process scroll wheel/input actions as scroller scrolls
		 */
		_onMouseScroll = function _onMouseScroll(event) {
			var scrollDeltaX, scrollDeltaY;
			if (_inputIdentifier !== 'scrollwheel') {
				if (_inputIdentifier !== false) {
					return true;
				}
				_inputIdentifier = 'scrollwheel';
				_cumulativeScroll.x = 0;
				_cumulativeScroll.y = 0;

				// Start a scroll event
				if (!_startScroll(event.clientX, event.clientY, Date.now(), event)) {
					return;
				}
			}

			// Convert the scrollwheel values to a scroll value
			if (event.wheelDelta) {
				if (event.wheelDeltaX) {
					scrollDeltaX = event.wheelDeltaX / 2;
					scrollDeltaY = event.wheelDeltaY / 2;
				} else {
					scrollDeltaX = 0;
					scrollDeltaY = event.wheelDelta / 2;
				}
			} else {
				if (event.axis && event.axis === event.HORIZONTAL_AXIS) {
					scrollDeltaX = event.detail * -10;
					scrollDeltaY = 0;
				} else {
					scrollDeltaX = 0;
					scrollDeltaY = event.detail * -10;
				}
			}

			// If the scroller is constrained to an x axis, convert y scroll to allow single-axis scroll
			// wheels to scroll constrained content.
			if (!_instanceOptions.scrollingY && !scrollDeltaX) {
				scrollDeltaX = scrollDeltaY;
				scrollDeltaY = 0;
			}

			_cumulativeScroll.x = Math.round(_cumulativeScroll.x + scrollDeltaX);
			_cumulativeScroll.y = Math.round(_cumulativeScroll.y + scrollDeltaY);

			_updateScroll(_gestureStart.x + _cumulativeScroll.x, _gestureStart.y + _cumulativeScroll.y, event.timeStamp, event);

			// End scrolling state
			if (_scrollWheelEndDebouncer) {
				clearTimeout(_scrollWheelEndDebouncer);
			}
			_scrollWheelEndDebouncer = setTimeout(function () {
				_inputIdentifier = false;
				_releaseInputCapture();
				_isScrolling = false;
				_isDisplayingScroll = false;
				_ftscrollerMoving = false;
				if (_instanceOptions.windowScrollingActiveFlag) {
					window[_instanceOptions.windowScrollingActiveFlag] = false;
				}
				_cancelAnimation();
				if (!_snapScroll()) {
					_finalizeScroll();
				}
			}, 300);
		};

		/**
		 * Capture and release input support, particularly allowing tracking
		 * of Metro pointers outside the docked view.
		 */
		_captureInput = function _captureInput() {
			if (_inputCaptured || _inputIdentifier === false || _inputIdentifier === 'scrollwheel') {
				return;
			}
			if (_trackPointerEvents) {
				_containerNode.msSetPointerCapture(_inputIdentifier);
				_containerNode.addEventListener('MSLostPointerCapture', _onPointerCaptureEnd, false);
			}
			_inputCaptured = true;
		};
		_releaseInputCapture = function _releaseInputCapture() {
			if (!_inputCaptured) {
				return;
			}
			if (_trackPointerEvents) {
				_containerNode.removeEventListener('MSLostPointerCapture', _onPointerCaptureEnd, false);
				_containerNode.msReleasePointerCapture(_inputIdentifier);
			}
			_inputCaptured = false;
		};

		/**
		 * Utility function acting as a getBoundingClientRect polyfill.
		 */
		_getBoundingRect = function _getBoundingRect(anElement) {
			if (anElement.getBoundingClientRect) {
				return anElement.getBoundingClientRect();
			}

			var x = 0, y = 0, eachElement = anElement;
			while (eachElement) {
				x = x + eachElement.offsetLeft - eachElement.scrollLeft;
				y = y + eachElement.offsetTop - eachElement.scrollTop;
				eachElement = eachElement.offsetParent;
			}
			return { left: x, top: y, width: anElement.offsetWidth, height: anElement.offsetHeight };
		};


		/*                     Instantiation                     */

		// Set up the DOM node if appropriate
		_initializeDOM();

		// Update sizes
		_updateDimensions();

		// Set up the event handlers
		_toggleEventHandlers(true);

		// Define a public API to be returned at the bottom - this is the public-facing interface.
		_publicSelf = {
			destroy: destroy,
			setSnapSize: setSnapSize,
			scrollTo: scrollTo,
			scrollBy: scrollBy,
			updateDimensions: updateDimensions,
			addEventListener: addEventListener,
			removeEventListener: removeEventListener,
			get scrollHeight () { return _metrics.content.y; },
			set scrollHeight (value) { throw new SyntaxError('scrollHeight is currently read-only - ignoring ' + value); },
			get scrollLeft () { return -_lastScrollPosition.x; },
			set scrollLeft (value) { scrollTo(value, false, false); return -_lastScrollPosition.x; },
			get scrollTop () { return -_lastScrollPosition.y; },
			set scrollTop (value) { scrollTo(false, value, false); return -_lastScrollPosition.y; },
			get scrollWidth () { return _metrics.content.x; },
			set scrollWidth (value) { throw new SyntaxError('scrollWidth is currently read-only - ignoring ' + value); },
			get segmentCount () {
				if (!_instanceOptions.snapping) {
					return { x: NaN, y: NaN };
				}
				return {
					x: Math.ceil(_metrics.content.x / _snapGridSize.x),
					y: Math.ceil(_metrics.content.y / _snapGridSize.y)
				};
			},
			set segmentCount (value) { throw new SyntaxError('segmentCount is currently read-only - ignoring ' + value); },
			get currentSegment () { return { x: _activeSegment.x, y: _activeSegment.y }; },
			set currentSegment (value) { throw new SyntaxError('currentSegment is currently read-only - ignoring ' + value); },
			get contentContainerNode () { return _contentParentNode; },
			set contentContainerNode (value) { throw new SyntaxError('contentContainerNode is currently read-only - ignoring ' + value); }
		};

		// Return the public interface.
		return _publicSelf;
	};


	/*          Prototype Functions and Properties           */

	/**
	 * The HTML to prepend to the scrollable content to wrap it. Used internally,
	 * and may be used to pre-wrap scrollable content.  Axes can optionally
	 * be excluded for speed improvements.
	 */
	FTScroller.prototype.getPrependedHTML = function (excludeXAxis, excludeYAxis, hwAccelerationClass) {
		if (!hwAccelerationClass) {
			if (typeof FTScrollerOptions === 'object' && FTScrollerOptions.hwAccelerationClass) {
				hwAccelerationClass = FTScrollerOptions.hwAccelerationClass;
			} else {
				hwAccelerationClass = 'ftscroller_hwaccelerated';
			}
		}

		var output = '<div class="ftscroller_container">';
		if (!excludeXAxis) {
			output += '<div class="ftscroller_x ' + hwAccelerationClass + '">';
		}
		if (!excludeYAxis) {
			output += '<div class="ftscroller_y ' + hwAccelerationClass + '">';
		}

		return output;
	};

	/**
	 * The HTML to append to the scrollable content to wrap it; again, used internally,
	 * and may be used to pre-wrap scrollable content.
	 */
	FTScroller.prototype.getAppendedHTML = function (excludeXAxis, excludeYAxis, hwAccelerationClass, scrollbars) {
		if (!hwAccelerationClass) {
			if (typeof FTScrollerOptions === 'object' && FTScrollerOptions.hwAccelerationClass) {
				hwAccelerationClass = FTScrollerOptions.hwAccelerationClass;
			} else {
				hwAccelerationClass = 'ftscroller_hwaccelerated';
			}
		}

		var output = '';
		if (!excludeXAxis) {
			output += '</div>';
		}
		if (!excludeYAxis) {
			output += '</div>';
		}
		if (scrollbars) {
			if (!excludeXAxis) {
				output += '<div class="ftscroller_scrollbar ftscroller_scrollbarx ' + hwAccelerationClass + '"><div class="ftscroller_scrollbarinner"></div></div>';
			}
			if (!excludeYAxis) {
				output += '<div class="ftscroller_scrollbar ftscroller_scrollbary ' + hwAccelerationClass + '"><div class="ftscroller_scrollbarinner"></div></div>';
			}
		}
		output += '</div>';

		return output;
	};
}());


(function () {
	

	/**
	 * Represents a two-dimensional cubic bezier curve with the starting
	 * point (0, 0) and the end point (1, 1). The two control points p1 and p2
	 * have x and y coordinates between 0 and 1.
	 *
	 * This type of bezier curves can be used as CSS transform timing functions.
	 */
	CubicBezier = function (p1x, p1y, p2x, p2y) {
		if (!(p1x >= 0 && p1x <= 1)) {
			throw new RangeError('"p1x" must be a number between 0 and 1. ' + 'Got ' + p1x + 'instead.');
		}
		if (!(p1y >= 0 && p1y <= 1)) {
			throw new RangeError('"p1y" must be a number between 0 and 1. ' + 'Got ' + p1y + 'instead.');
		}
		if (!(p2x >= 0 && p2x <= 1)) {
			throw new RangeError('"p2x" must be a number between 0 and 1. ' + 'Got ' + p2x + 'instead.');
		}
		if (!(p2y >= 0 && p2y <= 1)) {
			throw new RangeError('"p2y" must be a number between 0 and 1. ' + 'Got ' + p2y + 'instead.');
		}

		// Control points
		this._p1 = { x: p1x, y: p1y };
		this._p2 = { x: p2x, y: p2y };
	};

	CubicBezier.prototype._getCoordinateForT = function (t, p1, p2) {
		var c = 3 * p1,
			b = 3 * (p2 - p1) - c,
			a = 1 - c - b;

		return ((a * t + b) * t + c) * t;
	};

	CubicBezier.prototype._getCoordinateDerivateForT = function (t, p1, p2) {
		var c = 3 * p1,
			b = 3 * (p2 - p1) - c,
			a = 1 - c - b;

		return (3 * a * t + 2 * b) * t + c;
	};

	CubicBezier.prototype._getTForCoordinate = function (c, p1, p2, epsilon) {
		if (!isFinite(epsilon) || epsilon <= 0) {
			throw new RangeError('"epsilon" must be a number greater than 0.');
		}
		var t2, i, c2, d2;

		// First try a few iterations of Newton's method -- normally very fast.
		for (t2 = c, i = 0; i < 8; i = i + 1) {
			c2 = this._getCoordinateForT(t2, p1, p2) - c;
			if (Math.abs(c2) < epsilon) {
				return t2;
			}
			d2 = this._getCoordinateDerivateForT(t2, p1, p2);
			if (Math.abs(d2) < 1e-6) {
				break;
			}
			t2 = t2 - c2 / d2;
		}

		// Fall back to the bisection method for reliability.
		t2 = c;
		var t0 = 0,
			t1 = 1;

		if (t2 < t0) {
			return t0;
		}
		if (t2 > t1) {
			return t1;
		}

		while (t0 < t1) {
			c2 = this._getCoordinateForT(t2, p1, p2);
			if (Math.abs(c2 - c) < epsilon) {
				return t2;
			}
			if (c > c2) {
				t0 = t2;
			} else {
				t1 = t2;
			}
			t2 = (t1 - t0) * 0.5 + t0;
		}

		// Failure.
		return t2;
	};

	/**
	 * Computes the point for a given t value.
	 *
	 * @param {number} t
	 * @returns {Object} Returns an object with x and y properties
	 */
	CubicBezier.prototype.getPointForT = function (t) {

		// Special cases: starting and ending points
		if (t === 0 || t === 1) {
			return { x: t, y: t };
		}

		// Check for correct t value (must be between 0 and 1)
		if (t < 0 || t > 1) {
			throw new RangeError('"t" must be a number between 0 and 1' + 'Got ' + t + ' instead.');
		}

		return {
			x: this._getCoordinateForT(t, this._p1.x, this._p2.x),
			y: this._getCoordinateForT(t, this._p1.y, this._p2.y)
		};
	};

	CubicBezier.prototype.getTForX = function (x, epsilon) {
		return this._getTForCoordinate(x, this._p1.x, this._p2.x, epsilon);
	};

	CubicBezier.prototype.getTForY = function (y, epsilon) {
		return this._getTForCoordinate(y, this._p1.y, this._p2.y, epsilon);
	};

	/**
	 * Computes auxiliary points using De Casteljau's algorithm.
	 *
	 * @param {number} t must be greater than 0 and lower than 1.
	 * @returns {Object} with members i0, i1, i2 (first iteration),
	 *    j1, j2 (second iteration) and k (the exact point for t)
	 */
	CubicBezier.prototype._getAuxPoints = function (t) {
		if (t <= 0 || t >= 1) {
			throw new RangeError('"t" must be greater than 0 and lower than 1');
		}


		/* First series of auxiliary points */

		// First control point of the left curve
		var i0 = {
				x: t * this._p1.x,
				y: t * this._p1.y
			},
			i1 = {
				x: this._p1.x + t * (this._p2.x - this._p1.x),
				y: this._p1.y + t * (this._p2.y - this._p1.y)
			},

			// Second control point of the right curve
			i2  = {
				x: this._p2.x + t * (1 - this._p2.x),
				y: this._p2.y + t * (1 - this._p2.y)
			};


		/* Second series of auxiliary points */

		// Second control point of the left curve
		var j0 = {
				x: i0.x + t * (i1.x - i0.x),
				y: i0.y + t * (i1.y - i0.y)
			},

			// First control point of the right curve
			j1 = {
				x: i1.x + t * (i2.x - i1.x),
				y: i1.y + t * (i2.y - i1.y)
			};

		// The division point (ending point of left curve, starting point of right curve)
		var k = {
				x: j0.x + t * (j1.x - j0.x),
				y: j0.y + t * (j1.y - j0.y)
			};

		return {
			i0: i0,
			i1: i1,
			i2: i2,
			j0: j0,
			j1: j1,
			k: k
		};
	};

	/**
	 * Divides the bezier curve into two bezier functions.
	 *
	 * De Casteljau's algorithm is used to compute the new starting, ending, and
	 * control points.
	 *
	 * @param {number} t must be greater than 0 and lower than 1.
	 *     t === 1 or t === 0 are the starting/ending points of the curve, so no
	 *     division is needed.
	 *
	 * @returns {CubicBezier[]} Returns an array containing two bezier curves
	 *     to the left and the right of t.
	 */
	CubicBezier.prototype.divideAtT = function (t) {
		if (t < 0 || t > 1) {
			throw new RangeError('"t" must be a number between 0 and 1. ' + 'Got ' + t + ' instead.');
		}

		// Special cases t = 0, t = 1: Curve can be cloned for one side, the other
		// side is a linear curve (with duration 0)
		if (t === 0 || t === 1) {
			var curves = [];
			curves[t] = CubicBezier.linear();
			curves[1 - t] = this.clone();
			return curves;
		}

		var left = {},
			right = {},
			points = this._getAuxPoints(t);

		var i0 = points.i0,
			i2 = points.i2,
			j0 = points.j0,
			j1 = points.j1,
			k = points.k;

		// Normalize derived points, so that the new curves starting/ending point
		// coordinates are (0, 0) respectively (1, 1)
		var factorX = k.x,
			factorY = k.y;

		left.p1 = {
			x: i0.x / factorX,
			y: i0.y / factorY
		};
		left.p2 = {
			x: j0.x / factorX,
			y: j0.y / factorY
		};

		right.p1 = {
			x: (j1.x - factorX) / (1 - factorX),
			y: (j1.y - factorY) / (1 - factorY)
		};

		right.p2 = {
			x: (i2.x - factorX) / (1 - factorX),
			y: (i2.y - factorY) / (1 - factorY)
		};

		return [
			new CubicBezier(left.p1.x, left.p1.y, left.p2.x, left.p2.y),
			new CubicBezier(right.p1.x, right.p1.y, right.p2.x, right.p2.y)
		];
	};

	CubicBezier.prototype.divideAtX = function (x, epsilon) {
		if (x < 0 || x > 1) {
			throw new RangeError('"x" must be a number between 0 and 1. ' + 'Got ' + x + ' instead.');
		}

		var t = this.getTForX(x, epsilon);
		return this.divideAtT(t);
	};

	CubicBezier.prototype.divideAtY = function (y, epsilon) {
		if (y < 0 || y > 1) {
			throw new RangeError('"y" must be a number between 0 and 1. ' + 'Got ' + y + ' instead.');
		}

		var t = this.getTForY(y, epsilon);
		return this.divideAtT(t);
	};

	CubicBezier.prototype.clone = function () {
		return new CubicBezier(this._p1.x, this._p1.y, this._p2.x, this._p2.y);
	};

	CubicBezier.prototype.toString = function () {
		return "cubic-bezier(" + [
			this._p1.x,
			this._p1.y,
			this._p2.x,
			this._p2.y
		].join(", ") + ")";
	};

	CubicBezier.linear = function () {
		return new CubicBezier();
	};

	CubicBezier.ease = function () {
		return new CubicBezier(0.25, 0.1, 0.25, 1.0);
	};
	CubicBezier.linear = function () {
		return new CubicBezier(0.0, 0.0, 1.0, 1.0);
	};
	CubicBezier.easeIn = function () {
		return new CubicBezier(0.42, 0, 1.0, 1.0);
	};
	CubicBezier.easeOut = function () {
		return new CubicBezier(0, 0, 0.58, 1.0);
	};
	CubicBezier.easeInOut = function () {
		return new CubicBezier(0.42, 0, 0.58, 1.0);
	};
}());

// If a CommonJS environment is present, add our exports; make the check in a jslint-compatible method.
if (typeof module === 'object' && module.exports) {
	module.exports = function(domNode, options) {
		
		return new FTScroller(domNode, options);
	};

	module.exports.FTScroller = FTScroller;
	module.exports.CubicBezier = CubicBezier;
}
;
define("ftscroller", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.FTScroller;
    };
}(this)));

define('app/vent',[
	'underscore',
	'backbone'
], function(_, Backbone) {
	
	var vent = {};
	_.extend(vent, Backbone.Events);
	return vent;
});
define('app/app',[
		'modernizr',
		'jquery',
		'underscore',
		'backbone',
		'ftscroller',
		'app/vent',
], function(Modernizr, $, _, Backbone, FTScroller, vent) {
	

	var AppView = Backbone.View.extend({
		title: '',
		sectionIds: [],
		currentSection: 'Home',
		el: 'body',

		events: {
			'click a[href^=#]': 'onAnchorClick',
			'submit form': 'submitForm'
		},

		initialize: function() {
			// INIT
			this.$document = $(document);
			this.title = this.$document.attr('title');
			this.$main = this.$el.find('#main');
			this.$navLinks = this.$el.find('nav a');
			this.$sections = this.$el.find('section');
			this.$form = this.$el.find('form:first');
			this.$loader = this.$el.find('#loading');
			this.sectionIds = this.getIds(this.$sections);

			var scroller = new FTScroller(document.getElementById('main'), {
				scrollingX: false,
				scrollbars: false,
				snapping: true,
				paginatedSnap: true,
				snapSizeY: this.getDimensions()
			});
			console.log(scroller);

			// EVENTS
			this.listenTo(vent, 'Router', this.router, this);

		},

		getDimensions: function($el) {
			var dimensions = [];

			dimensions = [{
					width: 400,
					height: 500
				}, {
					width: 400,
					height: 100
				}, {
					width: 400,
					height: 200
				}
			];
			return dimensions;

		},

		onAnchorClick: function(e) {
			e.preventDefault();
			var $el = $(e.currentTarget),
				href = $el.attr('href');
			if (href === '#' + this.currentSection) {
				//e.preventDefault();
				return false;
			}
			vent.trigger('App:onAnchorClick', href, {
				trigger: true
			});
		},

		getIds: function($els) {
			var ids = [];
			_.each($els, function(el, i) {
				ids.push(el.id);
			});
			return ids;
		},

		setLoading: function() {
			var $deferred = $.Deferred();
			this.$loader.fadeIn(0, function() {
				this.$el.addClass('loading');
				$deferred.resolve();
			}.bind(this));
			return $deferred;
		},

		setLoaded: function() {
			var $deferred = $.Deferred();
			this.$loader.fadeOut(0, function() {
				this.$el.removeClass('loading');
				$deferred.resolve();
			}.bind(this));
			return $deferred;
		},

		router: function(param) {
			/*if (_.indexOf(this.sectionIds, param) > -1 && param !== this.currentSection) {
				return this.showSection(param);
			}
			return this.showSection(this.currentSection);*/
		},

		render: function() {
			return this;
		}
	});

	return AppView;
});
/*global define*/
define('app/routers/router',[
	'jquery',
	'backbone',
	'app/vent'
], function($, Backbone, vent) {
	

	var Workspace = Backbone.Router.extend({
		initialize: function(options) {
						window.scrollTo(0, 0);
			this.listenTo(vent, 'App:onAnchorClick', this.navigate, this);
		},
		routes: {
			'*actions': 'defaultRoute'
		},

		defaultRoute: function(param) {
			window.scrollTo(0, 0);
			param = param ? param.trim() : '';
			vent.trigger('Router', param);
		}
	});

	return Workspace;
});
require.config({
  baseUrl: 'js',
  paths: {
    'es5shim': '../vendor/es5-shim/es5-shim',
    'jquery': '../vendor/jquery/jquery',
    'underscore': '../vendor/underscore-amd/underscore',
    'backbone': '../vendor/backbone-amd/backbone',
    'ftscroller': 'require/ftscroller',
    //'jquerypp': '../vendor/jquerypp',

  },
  shim: {
    jquery: {
      exports: '$'
    },
    underscore: {
      exports: '_'
    },
    backbone: {
      deps: ['jquery', 'underscore'],
      exports: 'Backbone'
    },
    ftscroller: {
      exports: 'FTScroller'
    }
  }
});

define('modernizr', [],function() {
  return window.Modernizr;
});

require([
  'es5shim',
  'backbone',
  'app/app',
  'app/routers/router'
], function(es5shim,Backbone, App, Router) {
  /*jshint nonew:false*/
  new App();

  // Initialize routing and start Backbone.history()
  new Router();
  Backbone.history.start();

  // Initialize the application view
});
define("main", function(){});
