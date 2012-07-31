/**
 * almond 0.1.1 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var defined = {},
	waiting = {},
	config = {},
	defining = {},
	aps = [].slice,
	main, req;

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
	var baseParts = baseName && baseName.split("/"),
	    map = config.map,
	    starMap = (map && map['*']) || {},
	    nameParts, nameSegment, mapValue, foundMap, i, j, part;

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
		for (i = 0; (part = name[i]); i++) {
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
			    return true;
			} else if (i > 0) {
			    name.splice(i - 1, 2);
			    i -= 2;
			}
		    }
		}
		//end trimDots

		name = name.join("/");
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
				break;
			    }
			}
		    }
		}

		foundMap = foundMap || starMap[nameSegment];

		if (foundMap) {
		    nameParts.splice(0, i, foundMap);
		    name = nameParts.join('/');
		    break;
		}
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
	if (waiting.hasOwnProperty(name)) {
	    var args = waiting[name];
	    delete waiting[name];
	    defining[name] = true;
	    main.apply(undef, args);
	}

	if (!defined.hasOwnProperty(name)) {
	    throw new Error('No ' + name);
	}
	return defined[name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    function makeMap(name, relName) {
	var prefix, plugin,
	    index = name.indexOf('!');

	if (index !== -1) {
	    prefix = normalize(name.slice(0, index), relName);
	    name = name.slice(index + 1);
	    plugin = callDep(prefix);

	    //Normalize according
	    if (plugin && plugin.normalize) {
		name = plugin.normalize(name, makeNormalize(relName));
	    } else {
		name = normalize(name, relName);
	    }
	} else {
	    name = normalize(name, relName);
	}

	//Using ridiculous property names for space reasons
	return {
	    f: prefix ? prefix + '!' + name : name, //fullName
	    n: name,
	    p: plugin
	};
    }

    function makeConfig(name) {
	return function () {
	    return (config && config.config && config.config[name]) || {};
	};
    }

    main = function (name, deps, callback, relName) {
	var args = [],
	    usingExports,
	    cjsModule, depName, ret, map, i;

	//Use name if no relName
	relName = relName || name;

	//Call the callback to define the module, if necessary.
	if (typeof callback === 'function') {

	    //Pull out the defined dependencies and pass the ordered
	    //values to the callback.
	    //Default to [require, exports, module] if no deps
	    deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
	    for (i = 0; i < deps.length; i++) {
		map = makeMap(deps[i], relName);
		depName = map.f;

		//Fast path CommonJS standard dependencies.
		if (depName === "require") {
		    args[i] = makeRequire(name);
		} else if (depName === "exports") {
		    //CommonJS module spec 1.1
		    args[i] = defined[name] = {};
		    usingExports = true;
		} else if (depName === "module") {
		    //CommonJS module spec 1.1
		    cjsModule = args[i] = {
			id: name,
			uri: '',
			exports: defined[name],
			config: makeConfig(name)
		    };
		} else if (defined.hasOwnProperty(depName) || waiting.hasOwnProperty(depName)) {
		    args[i] = callDep(depName);
		} else if (map.p) {
		    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
		    args[i] = defined[depName];
		} else if (!defining[depName]) {
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

    requirejs = require = req = function (deps, callback, relName, forceSync) {
	if (typeof deps === "string") {
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

	//Simulate async callback;
	if (forceSync) {
	    main(undef, deps, callback, relName);
	} else {
	    setTimeout(function () {
		main(undef, deps, callback, relName);
	    }, 15);
	}

	return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
	config = cfg;
	return req;
    };

    define = function (name, deps, callback) {

	//This module may not have dependencies
	if (!deps.splice) {
	    //deps is not an array, so probably means
	    //an object literal or factory function for
	    //the value. Adjust args.
	    callback = deps;
	    deps = [];
	}

	waiting[name] = [name, deps, callback];
    };

    define.amd = {
	jQuery: true
    };
}());

//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

//     (c) 2010-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

// Vector and Matrix mathematics modules for JavaScript
// Copyright (c) 2007 James Coglan
// 
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// ==========================================================================
// Project:  TransformJS        
// Copyright: ©2011 Strobe Inc.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================

/*
 * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
 *
 * Uses the built in easing capabilities added In jQuery 1.1
 * to offer multiple easing options
 *
 * TERMS OF USE - jQuery Easing
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2008 George McGinley Smith
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
*/

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2001 Robert Penner
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
 */

function Matrix(){}(function(){function C(e,t,n){if(e===t)return e!==0||1/e==1/t;if(e==null||t==null)return e===t;e._chain&&(e=e._wrapped),t._chain&&(t=t._wrapped);if(e.isEqual&&S.isFunction(e.isEqual))return e.isEqual(t);if(t.isEqual&&S.isFunction(t.isEqual))return t.isEqual(e);var r=a.call(e);if(r!=a.call(t))return!1;switch(r){case"[object String]":return e==String(t);case"[object Number]":return e!=+e?t!=+t:e==0?1/e==1/t:e==+t;case"[object Date]":case"[object Boolean]":return+e==+t;case"[object RegExp]":return e.source==t.source&&e.global==t.global&&e.multiline==t.multiline&&e.ignoreCase==t.ignoreCase}if(typeof e!="object"||typeof t!="object")return!1;var i=n.length;while(i--)if(n[i]==e)return!0;n.push(e);var s=0,o=!0;if(r=="[object Array]"){s=e.length,o=s==t.length;if(o)while(s--)if(!(o=s in e==s in t&&C(e[s],t[s],n)))break}else{if("constructor"in e!="constructor"in t||e.constructor!=t.constructor)return!1;for(var u in e)if(S.has(e,u)){s++;if(!(o=S.has(t,u)&&C(e[u],t[u],n)))break}if(o){for(u in t)if(S.has(t,u)&&!(s--))break;o=!s}}return n.pop(),o}var e=this,t=e._,n={},r=Array.prototype,i=Object.prototype,s=Function.prototype,o=r.slice,u=r.unshift,a=i.toString,f=i.hasOwnProperty,l=r.forEach,c=r.map,h=r.reduce,p=r.reduceRight,d=r.filter,v=r.every,m=r.some,g=r.indexOf,y=r.lastIndexOf,b=Array.isArray,w=Object.keys,E=s.bind,S=function(e){return new P(e)};typeof exports!="undefined"?(typeof module!="undefined"&&module.exports&&(exports=module.exports=S),exports._=S):e._=S,S.VERSION="1.3.3";var x=S.each=S.forEach=function(e,t,r){if(e==null)return;if(l&&e.forEach===l)e.forEach(t,r);else if(e.length===+e.length){for(var i=0,s=e.length;i<s;i++)if(i in e&&t.call(r,e[i],i,e)===n)return}else for(var o in e)if(S.has(e,o)&&t.call(r,e[o],o,e)===n)return};S.map=S.collect=function(e,t,n){var r=[];return e==null?r:c&&e.map===c?e.map(t,n):(x(e,function(e,i,s){r[r.length]=t.call(n,e,i,s)}),e.length===+e.length&&(r.length=e.length),r)},S.reduce=S.foldl=S.inject=function(e,t,n,r){var i=arguments.length>2;e==null&&(e=[]);if(h&&e.reduce===h)return r&&(t=S.bind(t,r)),i?e.reduce(t,n):e.reduce(t);x(e,function(e,s,o){i?n=t.call(r,n,e,s,o):(n=e,i=!0)});if(!i)throw new TypeError("Reduce of empty array with no initial value");return n},S.reduceRight=S.foldr=function(e,t,n,r){var i=arguments.length>2;e==null&&(e=[]);if(p&&e.reduceRight===p)return r&&(t=S.bind(t,r)),i?e.reduceRight(t,n):e.reduceRight(t);var s=S.toArray(e).reverse();return r&&!i&&(t=S.bind(t,r)),i?S.reduce(s,t,n,r):S.reduce(s,t)},S.find=S.detect=function(e,t,n){var r;return T(e,function(e,i,s){if(t.call(n,e,i,s))return r=e,!0}),r},S.filter=S.select=function(e,t,n){var r=[];return e==null?r:d&&e.filter===d?e.filter(t,n):(x(e,function(e,i,s){t.call(n,e,i,s)&&(r[r.length]=e)}),r)},S.reject=function(e,t,n){var r=[];return e==null?r:(x(e,function(e,i,s){t.call(n,e,i,s)||(r[r.length]=e)}),r)},S.every=S.all=function(e,t,r){var i=!0;return e==null?i:v&&e.every===v?e.every(t,r):(x(e,function(e,s,o){if(!(i=i&&t.call(r,e,s,o)))return n}),!!i)};var T=S.some=S.any=function(e,t,r){t||(t=S.identity);var i=!1;return e==null?i:m&&e.some===m?e.some(t,r):(x(e,function(e,s,o){if(i||(i=t.call(r,e,s,o)))return n}),!!i)};S.include=S.contains=function(e,t){var n=!1;return e==null?n:g&&e.indexOf===g?e.indexOf(t)!=-1:(n=T(e,function(e){return e===t}),n)},S.invoke=function(e,t){var n=o.call(arguments,2);return S.map(e,function(e){return(S.isFunction(t)?t||e:e[t]).apply(e,n)})},S.pluck=function(e,t){return S.map(e,function(e){return e[t]})},S.max=function(e,t,n){if(!t&&S.isArray(e)&&e[0]===+e[0])return Math.max.apply(Math,e);if(!t&&S.isEmpty(e))return-Infinity;var r={computed:-Infinity};return x(e,function(e,i,s){var o=t?t.call(n,e,i,s):e;o>=r.computed&&(r={value:e,computed:o})}),r.value},S.min=function(e,t,n){if(!t&&S.isArray(e)&&e[0]===+e[0])return Math.min.apply(Math,e);if(!t&&S.isEmpty(e))return Infinity;var r={computed:Infinity};return x(e,function(e,i,s){var o=t?t.call(n,e,i,s):e;o<r.computed&&(r={value:e,computed:o})}),r.value},S.shuffle=function(e){var t=[],n;return x(e,function(e,r,i){n=Math.floor(Math.random()*(r+1)),t[r]=t[n],t[n]=e}),t},S.sortBy=function(e,t,n){var r=S.isFunction(t)?t:function(e){return e[t]};return S.pluck(S.map(e,function(e,t,i){return{value:e,criteria:r.call(n,e,t,i)}}).sort(function(e,t){var n=e.criteria,r=t.criteria;return n===void 0?1:r===void 0?-1:n<r?-1:n>r?1:0}),"value")},S.groupBy=function(e,t){var n={},r=S.isFunction(t)?t:function(e){return e[t]};return x(e,function(e,t){var i=r(e,t);(n[i]||(n[i]=[])).push(e)}),n},S.sortedIndex=function(e,t,n){n||(n=S.identity);var r=0,i=e.length;while(r<i){var s=r+i>>1;n(e[s])<n(t)?r=s+1:i=s}return r},S.toArray=function(e){return e?S.isArray(e)?o.call(e):S.isArguments(e)?o.call(e):e.toArray&&S.isFunction(e.toArray)?e.toArray():S.values(e):[]},S.size=function(e){return S.isArray(e)?e.length:S.keys(e).length},S.first=S.head=S.take=function(e,t,n){return t!=null&&!n?o.call(e,0,t):e[0]},S.initial=function(e,t,n){return o.call(e,0,e.length-(t==null||n?1:t))},S.last=function(e,t,n){return t!=null&&!n?o.call(e,Math.max(e.length-t,0)):e[e.length-1]},S.rest=S.tail=function(e,t,n){return o.call(e,t==null||n?1:t)},S.compact=function(e){return S.filter(e,function(e){return!!e})},S.flatten=function(e,t){return S.reduce(e,function(e,n){return S.isArray(n)?e.concat(t?n:S.flatten(n)):(e[e.length]=n,e)},[])},S.without=function(e){return S.difference(e,o.call(arguments,1))},S.uniq=S.unique=function(e,t,n){var r=n?S.map(e,n):e,i=[];return e.length<3&&(t=!0),S.reduce(r,function(n,r,s){if(t?S.last(n)!==r||!n.length:!S.include(n,r))n.push(r),i.push(e[s]);return n},[]),i},S.union=function(){return S.uniq(S.flatten(arguments,!0))},S.intersection=S.intersect=function(e){var t=o.call(arguments,1);return S.filter(S.uniq(e),function(e){return S.every(t,function(t){return S.indexOf(t,e)>=0})})},S.difference=function(e){var t=S.flatten(o.call(arguments,1),!0);return S.filter(e,function(e){return!S.include(t,e)})},S.zip=function(){var e=o.call(arguments),t=S.max(S.pluck(e,"length")),n=new Array(t);for(var r=0;r<t;r++)n[r]=S.pluck(e,""+r);return n},S.indexOf=function(e,t,n){if(e==null)return-1;var r,i;if(n)return r=S.sortedIndex(e,t),e[r]===t?r:-1;if(g&&e.indexOf===g)return e.indexOf(t);for(r=0,i=e.length;r<i;r++)if(r in e&&e[r]===t)return r;return-1},S.lastIndexOf=function(e,t){if(e==null)return-1;if(y&&e.lastIndexOf===y)return e.lastIndexOf(t);var n=e.length;while(n--)if(n in e&&e[n]===t)return n;return-1},S.range=function(e,t,n){arguments.length<=1&&(t=e||0,e=0),n=arguments[2]||1;var r=Math.max(Math.ceil((t-e)/n),0),i=0,s=new Array(r);while(i<r)s[i++]=e,e+=n;return s};var N=function(){};S.bind=function(t,n){var r,i;if(t.bind===E&&E)return E.apply(t,o.call(arguments,1));if(!S.isFunction(t))throw new TypeError;return i=o.call(arguments,2),r=function(){if(this instanceof r){N.prototype=t.prototype;var e=new N,s=t.apply(e,i.concat(o.call(arguments)));return Object(s)===s?s:e}return t.apply(n,i.concat(o.call(arguments)))}},S.bindAll=function(e){var t=o.call(arguments,1);return t.length==0&&(t=S.functions(e)),x(t,function(t){e[t]=S.bind(e[t],e)}),e},S.memoize=function(e,t){var n={};return t||(t=S.identity),function(){var r=t.apply(this,arguments);return S.has(n,r)?n[r]:n[r]=e.apply(this,arguments)}},S.delay=function(e,t){var n=o.call(arguments,2);return setTimeout(function(){return e.apply(null,n)},t)},S.defer=function(e){return S.delay.apply(S,[e,1].concat(o.call(arguments,1)))},S.throttle=function(e,t){var n,r,i,s,o,u,a=S.debounce(function(){o=s=!1},t);return function(){n=this,r=arguments;var f=function(){i=null,o&&e.apply(n,r),a()};return i||(i=setTimeout(f,t)),s?o=!0:u=e.apply(n,r),a(),s=!0,u}},S.debounce=function(e,t,n){var r;return function(){var i=this,s=arguments,o=function(){r=null,n||e.apply(i,s)};n&&!r&&e.apply(i,s),clearTimeout(r),r=setTimeout(o,t)}},S.once=function(e){var t=!1,n;return function(){return t?n:(t=!0,n=e.apply(this,arguments))}},S.wrap=function(e,t){return function(){var n=[e].concat(o.call(arguments,0));return t.apply(this,n)}},S.compose=function(){var e=arguments;return function(){var t=arguments;for(var n=e.length-1;n>=0;n--)t=[e[n].apply(this,t)];return t[0]}},S.after=function(e,t){return e<=0?t():function(){if(--e<1)return t.apply(this,arguments)}},S.keys=w||function(e){if(e!==Object(e))throw new TypeError("Invalid object");var t=[];for(var n in e)S.has(e,n)&&(t[t.length]=n);return t},S.values=function(e){return S.map(e,S.identity)},S.functions=S.methods=function(e){var t=[];for(var n in e)S.isFunction(e[n])&&t.push(n);return t.sort()},S.extend=function(e){return x(o.call(arguments,1),function(t){for(var n in t)e[n]=t[n]}),e},S.pick=function(e){var t={};return x(S.flatten(o.call(arguments,1)),function(n){n in e&&(t[n]=e[n])}),t},S.defaults=function(e){return x(o.call(arguments,1),function(t){for(var n in t)e[n]==null&&(e[n]=t[n])}),e},S.clone=function(e){return S.isObject(e)?S.isArray(e)?e.slice():S.extend({},e):e},S.tap=function(e,t){return t(e),e},S.isEqual=function(e,t){return C(e,t,[])},S.isEmpty=function(e){if(e==null)return!0;if(S.isArray(e)||S.isString(e))return e.length===0;for(var t in e)if(S.has(e,t))return!1;return!0},S.isElement=function(e){return!!e&&e.nodeType==1},S.isArray=b||function(e){return a.call(e)=="[object Array]"},S.isObject=function(e){return e===Object(e)},S.isArguments=function(e){return a.call(e)=="[object Arguments]"},S.isArguments(arguments)||(S.isArguments=function(e){return!!e&&!!S.has(e,"callee")}),S.isFunction=function(e){return a.call(e)=="[object Function]"},S.isString=function(e){return a.call(e)=="[object String]"},S.isNumber=function(e){return a.call(e)=="[object Number]"},S.isFinite=function(e){return S.isNumber(e)&&isFinite(e)},S.isNaN=function(e){return e!==e},S.isBoolean=function(e){return e===!0||e===!1||a.call(e)=="[object Boolean]"},S.isDate=function(e){return a.call(e)=="[object Date]"},S.isRegExp=function(e){return a.call(e)=="[object RegExp]"},S.isNull=function(e){return e===null},S.isUndefined=function(e){return e===void 0},S.has=function(e,t){return f.call(e,t)},S.noConflict=function(){return e._=t,this},S.identity=function(e){return e},S.times=function(e,t,n){for(var r=0;r<e;r++)t.call(n,r)},S.escape=function(e){return(""+e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;").replace(/\//g,"&#x2F;")},S.result=function(e,t){if(e==null)return null;var n=e[t];return S.isFunction(n)?n.call(e):n},S.mixin=function(e){x(S.functions(e),function(t){B(t,S[t]=e[t])})};var k=0;S.uniqueId=function(e){var t=k++;return e?e+t:t},S.templateSettings={evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,escape:/<%-([\s\S]+?)%>/g};var L=/.^/,A={"\\":"\\","'":"'",r:"\r",n:"\n",t:"	",u2028:"\u2028",u2029:"\u2029"};for(var O in A)A[A[O]]=O;var M=/\\|'|\r|\n|\t|\u2028|\u2029/g,_=/\\(\\|'|r|n|t|u2028|u2029)/g,D=function(e){return e.replace(_,function(e,t){return A[t]})};S.template=function(e,t,n){n=S.defaults(n||{},S.templateSettings);var r="__p+='"+e.replace(M,function(e){return"\\"+A[e]}).replace(n.escape||L,function(e,t){return"'+\n_.escape("+D(t)+")+\n'"}).replace(n.interpolate||L,function(e,t){return"'+\n("+D(t)+")+\n'"}).replace(n.evaluate||L,function(e,t){return"';\n"+D(t)+"\n;__p+='"})+"';\n";n.variable||(r="with(obj||{}){\n"+r+"}\n"),r="var __p='';var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n"+r+"return __p;\n";var i=new Function(n.variable||"obj","_",r);if(t)return i(t,S);var s=function(e){return i.call(this,e,S)};return s.source="function("+(n.variable||"obj")+"){\n"+r+"}",s},S.chain=function(e){return S(e).chain()};var P=function(e){this._wrapped=e};S.prototype=P.prototype;var H=function(e,t){return t?S(e).chain():e},B=function(e,t){P.prototype[e]=function(){var e=o.call(arguments);return u.call(e,this._wrapped),H(t.apply(S,e),this._chain)}};S.mixin(S),x(["pop","push","reverse","shift","sort","splice","unshift"],function(e){var t=r[e];P.prototype[e]=function(){var n=this._wrapped;t.apply(n,arguments);var r=n.length;return(e=="shift"||e=="splice")&&r===0&&delete n[0],H(n,this._chain)}}),x(["concat","join","slice"],function(e){var t=r[e];P.prototype[e]=function(){return H(t.apply(this._wrapped,arguments),this._chain)}}),P.prototype.chain=function(){return this._chain=!0,this},P.prototype.value=function(){return this._wrapped}}).call(this),define("underscore",function(e){return function(){return e._}}(this)),function(){var e=this,t=e.Backbone,n=Array.prototype.slice,r=Array.prototype.splice,i;typeof exports!="undefined"?i=exports:i=e.Backbone={},i.VERSION="0.9.2";var s=e._;!s&&typeof require!="undefined"&&(s=require("underscore"));var o=e.jQuery||e.Zepto||e.ender;i.setDomLibrary=function(e){o=e},i.noConflict=function(){return e.Backbone=t,this},i.emulateHTTP=!1,i.emulateJSON=!1;var u=/\s+/,a=i.Events={on:function(e,t,n){var r,i,s,o,a;if(!t)return this;e=e.split(u),r=this._callbacks||(this._callbacks={});while(i=e.shift())a=r[i],s=a?a.tail:{},s.next=o={},s.context=n,s.callback=t,r[i]={tail:o,next:a?a.next:s};return this},off:function(e,t,n){var r,i,o,a,f,l;if(!(i=this._callbacks))return;if(!(e||t||n))return delete this._callbacks,this;e=e?e.split(u):s.keys(i);while(r=e.shift()){o=i[r],delete i[r];if(!o||!t&&!n)continue;a=o.tail;while((o=o.next)!==a)f=o.callback,l=o.context,(t&&f!==t||n&&l!==n)&&this.on(r,f,l)}return this},trigger:function(e){var t,r,i,s,o,a,f;if(!(i=this._callbacks))return this;a=i.all,e=e.split(u),f=n.call(arguments,1);while(t=e.shift()){if(r=i[t]){s=r.tail;while((r=r.next)!==s)r.callback.apply(r.context||this,f)}if(r=a){s=r.tail,o=[t].concat(f);while((r=r.next)!==s)r.callback.apply(r.context||this,o)}}return this}};a.bind=a.on,a.unbind=a.off;var f=i.Model=function(e,t){var n;e||(e={}),t&&t.parse&&(e=this.parse(e));if(n=C(this,"defaults"))e=s.extend({},n,e);t&&t.collection&&(this.collection=t.collection),this.attributes={},this._escapedAttributes={},this.cid=s.uniqueId("c"),this.changed={},this._silent={},this._pending={},this.set(e,{silent:!0}),this.changed={},this._silent={},this._pending={},this._previousAttributes=s.clone(this.attributes),this.initialize.apply(this,arguments)};s.extend(f.prototype,a,{changed:null,_silent:null,_pending:null,idAttribute:"id",initialize:function(){},toJSON:function(e){return s.clone(this.attributes)},get:function(e){return this.attributes[e]},escape:function(e){var t;if(t=this._escapedAttributes[e])return t;var n=this.get(e);return this._escapedAttributes[e]=s.escape(n==null?"":""+n)},has:function(e){return this.get(e)!=null},set:function(e,t,n){var r,i,o;s.isObject(e)||e==null?(r=e,n=t):(r={},r[e]=t),n||(n={});if(!r)return this;r instanceof f&&(r=r.attributes);if(n.unset)for(i in r)r[i]=void 0;if(!this._validate(r,n))return!1;this.idAttribute in r&&(this.id=r[this.idAttribute]);var u=n.changes={},a=this.attributes,l=this._escapedAttributes,c=this._previousAttributes||{};for(i in r){o=r[i];if(!s.isEqual(a[i],o)||n.unset&&s.has(a,i))delete l[i],(n.silent?this._silent:u)[i]=!0;n.unset?delete a[i]:a[i]=o,!s.isEqual(c[i],o)||s.has(a,i)!=s.has(c,i)?(this.changed[i]=o,n.silent||(this._pending[i]=!0)):(delete this.changed[i],delete this._pending[i])}return n.silent||this.change(n),this},unset:function(e,t){return(t||(t={})).unset=!0,this.set(e,null,t)},clear:function(e){return(e||(e={})).unset=!0,this.set(s.clone(this.attributes),e)},fetch:function(e){e=e?s.clone(e):{};var t=this,n=e.success;return e.success=function(r,i,s){if(!t.set(t.parse(r,s),e))return!1;n&&n(t,r)},e.error=i.wrapError(e.error,t,e),(this.sync||i.sync).call(this,"read",this,e)},save:function(e,t,n){var r,o;s.isObject(e)||e==null?(r=e,n=t):(r={},r[e]=t),n=n?s.clone(n):{};if(n.wait){if(!this._validate(r,n))return!1;o=s.clone(this.attributes)}var u=s.extend({},n,{silent:!0});if(r&&!this.set(r,n.wait?u:n))return!1;var a=this,f=n.success;n.success=function(e,t,i){var o=a.parse(e,i);n.wait&&(delete n.wait,o=s.extend(r||{},o));if(!a.set(o,n))return!1;f?f(a,e):a.trigger("sync",a,e,n)},n.error=i.wrapError(n.error,a,n);var l=this.isNew()?"create":"update",c=(this.sync||i.sync).call(this,l,this,n);return n.wait&&this.set(o,u),c},destroy:function(e){e=e?s.clone(e):{};var t=this,n=e.success,r=function(){t.trigger("destroy",t,t.collection,e)};if(this.isNew())return r(),!1;e.success=function(i){e.wait&&r(),n?n(t,i):t.trigger("sync",t,i,e)},e.error=i.wrapError(e.error,t,e);var o=(this.sync||i.sync).call(this,"delete",this,e);return e.wait||r(),o},url:function(){var e=C(this,"urlRoot")||C(this.collection,"url")||k();return this.isNew()?e:e+(e.charAt(e.length-1)=="/"?"":"/")+encodeURIComponent(this.id)},parse:function(e,t){return e},clone:function(){return new this.constructor(this.attributes)},isNew:function(){return this.id==null},change:function(e){e||(e={});var t=this._changing;this._changing=!0;for(var n in this._silent)this._pending[n]=!0;var r=s.extend({},e.changes,this._silent);this._silent={};for(var n in r)this.trigger("change:"+n,this,this.get(n),e);if(t)return this;while(!s.isEmpty(this._pending)){this._pending={},this.trigger("change",this,e);for(var n in this.changed){if(this._pending[n]||this._silent[n])continue;delete this.changed[n]}this._previousAttributes=s.clone(this.attributes)}return this._changing=!1,this},hasChanged:function(e){return arguments.length?s.has(this.changed,e):!s.isEmpty(this.changed)},changedAttributes:function(e){if(!e)return this.hasChanged()?s.clone(this.changed):!1;var t,n=!1,r=this._previousAttributes;for(var i in e){if(s.isEqual(r[i],t=e[i]))continue;(n||(n={}))[i]=t}return n},previous:function(e){return!arguments.length||!this._previousAttributes?null:this._previousAttributes[e]},previousAttributes:function(){return s.clone(this._previousAttributes)},isValid:function(){return!this.validate(this.attributes)},_validate:function(e,t){if(t.silent||!this.validate)return!0;e=s.extend({},this.attributes,e);var n=this.validate(e,t);return n?(t&&t.error?t.error(this,n,t):this.trigger("error",this,n,t),!1):!0}});var l=i.Collection=function(e,t){t||(t={}),t.model&&(this.model=t.model),t.comparator&&(this.comparator=t.comparator),this._reset(),this.initialize.apply(this,arguments),e&&this.reset(e,{silent:!0,parse:t.parse})};s.extend(l.prototype,a,{model:f,initialize:function(){},toJSON:function(e){return this.map(function(t){return t.toJSON(e)})},add:function(e,t){var n,i,o,u,a,f,l={},c={},h=[];t||(t={}),e=s.isArray(e)?e.slice():[e];for(n=0,o=e.length;n<o;n++){if(!(u=e[n]=this._prepareModel(e[n],t)))throw new Error("Can't add an invalid model to a collection");a=u.cid,f=u.id;if(l[a]||this._byCid[a]||f!=null&&(c[f]||this._byId[f])){h.push(n);continue}l[a]=c[f]=u}n=h.length;while(n--)e.splice(h[n],1);for(n=0,o=e.length;n<o;n++)(u=e[n]).on("all",this._onModelEvent,this),this._byCid[u.cid]=u,u.id!=null&&(this._byId[u.id]=u);this.length+=o,i=t.at!=null?t.at:this.models.length,r.apply(this.models,[i,0].concat(e)),this.comparator&&this.sort({silent:!0});if(t.silent)return this;for(n=0,o=this.models.length;n<o;n++){if(!l[(u=this.models[n]).cid])continue;t.index=n,u.trigger("add",u,this,t)}return this},remove:function(e,t){var n,r,i,o;t||(t={}),e=s.isArray(e)?e.slice():[e];for(n=0,r=e.length;n<r;n++){o=this.getByCid(e[n])||this.get(e[n]);if(!o)continue;delete this._byId[o.id],delete this._byCid[o.cid],i=this.indexOf(o),this.models.splice(i,1),this.length--,t.silent||(t.index=i,o.trigger("remove",o,this,t)),this._removeReference(o)}return this},push:function(e,t){return e=this._prepareModel(e,t),this.add(e,t),e},pop:function(e){var t=this.at(this.length-1);return this.remove(t,e),t},unshift:function(e,t){return e=this._prepareModel(e,t),this.add(e,s.extend({at:0},t)),e},shift:function(e){var t=this.at(0);return this.remove(t,e),t},get:function(e){return e==null?void 0:this._byId[e.id!=null?e.id:e]},getByCid:function(e){return e&&this._byCid[e.cid||e]},at:function(e){return this.models[e]},where:function(e){return s.isEmpty(e)?[]:this.filter(function(t){for(var n in e)if(e[n]!==t.get(n))return!1;return!0})},sort:function(e){e||(e={});if(!this.comparator)throw new Error("Cannot sort a set without a comparator");var t=s.bind(this.comparator,this);return this.comparator.length==1?this.models=this.sortBy(t):this.models.sort(t),e.silent||this.trigger("reset",this,e),this},pluck:function(e){return s.map(this.models,function(t){return t.get(e)})},reset:function(e,t){e||(e=[]),t||(t={});for(var n=0,r=this.models.length;n<r;n++)this._removeReference(this.models[n]);return this._reset(),this.add(e,s.extend({silent:!0},t)),t.silent||this.trigger("reset",this,t),this},fetch:function(e){e=e?s.clone(e):{},e.parse===undefined&&(e.parse=!0);var t=this,n=e.success;return e.success=function(r,i,s){t[e.add?"add":"reset"](t.parse(r,s),e),n&&n(t,r)},e.error=i.wrapError(e.error,t,e),(this.sync||i.sync).call(this,"read",this,e)},create:function(e,t){var n=this;t=t?s.clone(t):{},e=this._prepareModel(e,t);if(!e)return!1;t.wait||n.add(e,t);var r=t.success;return t.success=function(i,s,o){t.wait&&n.add(i,t),r?r(i,s):i.trigger("sync",e,s,t)},e.save(null,t),e},parse:function(e,t){return e},chain:function(){return s(this.models).chain()},_reset:function(e){this.length=0,this.models=[],this._byId={},this._byCid={}},_prepareModel:function(e,t){t||(t={});if(e instanceof f)e.collection||(e.collection=this);else{var n=e;t.collection=this,e=new this.model(n,t),e._validate(e.attributes,t)||(e=!1)}return e},_removeReference:function(e){this==e.collection&&delete e.collection,e.off("all",this._onModelEvent,this)},_onModelEvent:function(e,t,n,r){if((e=="add"||e=="remove")&&n!=this)return;e=="destroy"&&this.remove(t,r),t&&e==="change:"+t.idAttribute&&(delete this._byId[t.previous(t.idAttribute)],this._byId[t.id]=t),this.trigger.apply(this,arguments)}});var c=["forEach","each","map","reduce","reduceRight","find","detect","filter","select","reject","every","all","some","any","include","contains","invoke","max","min","sortBy","sortedIndex","toArray","size","first","initial","rest","last","without","indexOf","shuffle","lastIndexOf","isEmpty","groupBy"];s.each(c,function(e){l.prototype[e]=function(){return s[e].apply(s,[this.models].concat(s.toArray(arguments)))}});var h=i.Router=function(e){e||(e={}),e.routes&&(this.routes=e.routes),this._bindRoutes(),this.initialize.apply(this,arguments)},p=/:\w+/g,d=/\*\w+/g,v=/[-[\]{}()+?.,\\^$|#\s]/g;s.extend(h.prototype,a,{initialize:function(){},route:function(e,t,n){return i.history||(i.history=new m),s.isRegExp(e)||(e=this._routeToRegExp(e)),n||(n=this[t]),i.history.route(e,s.bind(function(r){var s=this._extractParameters(e,r);n&&n.apply(this,s),this.trigger.apply(this,["route:"+t].concat(s)),i.history.trigger("route",this,t,s)},this)),this},navigate:function(e,t){i.history.navigate(e,t)},_bindRoutes:function(){if(!this.routes)return;var e=[];for(var t in this.routes)e.unshift([t,this.routes[t]]);for(var n=0,r=e.length;n<r;n++)this.route(e[n][0],e[n][1],this[e[n][1]])},_routeToRegExp:function(e){return e=e.replace(v,"\\$&").replace(p,"([^/]+)").replace(d,"(.*?)"),new RegExp("^"+e+"$")},_extractParameters:function(e,t){return e.exec(t).slice(1)}});var m=i.History=function(){this.handlers=[],s.bindAll(this,"checkUrl")},g=/^[#\/]/,y=/msie [\w.]+/;m.started=!1,s.extend(m.prototype,a,{interval:50,getHash:function(e){var t=e?e.location:window.location,n=t.href.match(/#(.*)$/);return n?n[1]:""},getFragment:function(e,t){if(e==null)if(this._hasPushState||t){e=window.location.pathname;var n=window.location.search;n&&(e+=n)}else e=this.getHash();return e.indexOf(this.options.root)||(e=e.substr(this.options.root.length)),e.replace(g,"")},start:function(e){if(m.started)throw new Error("Backbone.history has already been started");m.started=!0,this.options=s.extend({},{root:"/"},this.options,e),this._wantsHashChange=this.options.hashChange!==!1,this._wantsPushState=!!this.options.pushState,this._hasPushState=!!(this.options.pushState&&window.history&&window.history.pushState);var t=this.getFragment(),n=document.documentMode,r=y.exec(navigator.userAgent.toLowerCase())&&(!n||n<=7);r&&(this.iframe=o('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo("body")[0].contentWindow,this.navigate(t)),this._hasPushState?o(window).bind("popstate",this.checkUrl):this._wantsHashChange&&"onhashchange"in window&&!r?o(window).bind("hashchange",this.checkUrl):this._wantsHashChange&&(this._checkUrlInterval=setInterval(this.checkUrl,this.interval)),this.fragment=t;var i=window.location,u=i.pathname==this.options.root;if(this._wantsHashChange&&this._wantsPushState&&!this._hasPushState&&!u)return this.fragment=this.getFragment(null,!0),window.location.replace(this.options.root+"#"+this.fragment),!0;this._wantsPushState&&this._hasPushState&&u&&i.hash&&(this.fragment=this.getHash().replace(g,""),window.history.replaceState({},document.title,i.protocol+"//"+i.host+this.options.root+this.fragment));if(!this.options.silent)return this.loadUrl()},stop:function(){o(window).unbind("popstate",this.checkUrl).unbind("hashchange",this.checkUrl),clearInterval(this._checkUrlInterval),m.started=!1},route:function(e,t){this.handlers.unshift({route:e,callback:t})},checkUrl:function(e){var t=this.getFragment();t==this.fragment&&this.iframe&&(t=this.getFragment(this.getHash(this.iframe)));if(t==this.fragment)return!1;this.iframe&&this.navigate(t),this.loadUrl()||this.loadUrl(this.getHash())},loadUrl:function(e){var t=this.fragment=this.getFragment(e),n=s.any(this.handlers,function(e){if(e.route.test(t))return e.callback(t),!0});return n},navigate:function(e,t){if(!m.started)return!1;if(!t||t===!0)t={trigger:t};var n=(e||"").replace(g,"");if(this.fragment==n)return;this._hasPushState?(n.indexOf(this.options.root)!=0&&(n=this.options.root+n),this.fragment=n,window.history[t.replace?"replaceState":"pushState"]({},document.title,n)):this._wantsHashChange?(this.fragment=n,this._updateHash(window.location,n,t.replace),this.iframe&&n!=this.getFragment(this.getHash(this.iframe))&&(t.replace||this.iframe.document.open().close(),this._updateHash(this.iframe.location,n,t.replace))):window.location.assign(this.options.root+e),t.trigger&&this.loadUrl(e)},_updateHash:function(e,t,n){n?e.replace(e.toString().replace(/(javascript:|#).*$/,"")+"#"+t):e.hash=t}});var b=i.View=function(e){this.cid=s.uniqueId("view"),this._configure(e||{}),this._ensureElement(),this.initialize.apply(this,arguments),this.delegateEvents()},w=/^(\S+)\s*(.*)$/,E=["model","collection","el","id","attributes","className","tagName"];s.extend(b.prototype,a,{tagName:"div",$:function(e){return this.$el.find(e)},initialize:function(){},render:function(){return this},remove:function(){return this.$el.remove(),this},make:function(e,t,n){var r=document.createElement(e);return t&&o(r).attr(t),n&&o(r).html(n),r},setElement:function(e,t){return this.$el&&this.undelegateEvents(),this.$el=e instanceof o?e:o(e),this.el=this.$el[0],t!==!1&&this.delegateEvents(),this},delegateEvents:function(e){if(!e&&!(e=C(this,"events")))return;this.undelegateEvents();for(var t in e){var n=e[t];s.isFunction(n)||(n=this[e[t]]);if(!n)throw new Error('Method "'+e[t]+'" does not exist');var r=t.match(w),i=r[1],o=r[2];n=s.bind(n,this),i+=".delegateEvents"+this.cid,o===""?this.$el.bind(i,n):this.$el.delegate(o,i,n)}},undelegateEvents:function(){this.$el.unbind(".delegateEvents"+this.cid)},_configure:function(e){this.options&&(e=s.extend({},this.options,e));for(var t=0,n=E.length;t<n;t++){var r=E[t];e[r]&&(this[r]=e[r])}this.options=e},_ensureElement:function(){if(!this.el){var e=C(this,"attributes")||{};this.id&&(e.id=this.id),this.className&&(e["class"]=this.className),this.setElement(this.make(this.tagName,e),!1)}else this.setElement(this.el,!1)}});var S=function(e,t){var n=N(this,e,t);return n.extend=this.extend,n};f.extend=l.extend=h.extend=b.extend=S;var x={create:"POST",update:"PUT","delete":"DELETE",read:"GET"};i.sync=function(e,t,n){var r=x[e];n||(n={});var u={type:r,dataType:"json"};return n.url||(u.url=C(t,"url")||k()),!n.data&&t&&(e=="create"||e=="update")&&(u.contentType="application/json",u.data=JSON.stringify(t.toJSON())),i.emulateJSON&&(u.contentType="application/x-www-form-urlencoded",u.data=u.data?{model:u.data}:{}),i.emulateHTTP&&(r==="PUT"||r==="DELETE")&&(i.emulateJSON&&(u.data._method=r),u.type="POST",u.beforeSend=function(e){e.setRequestHeader("X-HTTP-Method-Override",r)}),u.type!=="GET"&&!i.emulateJSON&&(u.processData=!1),o.ajax(s.extend(u,n))},i.wrapError=function(e,t,n){return function(r,i){i=r===t?i:r,e?e(t,i,n):t.trigger("error",t,i,n)}};var T=function(){},N=function(e,t,n){var r;return t&&t.hasOwnProperty("constructor")?r=t.constructor:r=function(){e.apply(this,arguments)},s.extend(r,e),T.prototype=e.prototype,r.prototype=new T,t&&s.extend(r.prototype,t),n&&s.extend(r,n),r.prototype.constructor=r,r.__super__=e.prototype,r},C=function(e,t){return!e||!e[t]?null:s.isFunction(e[t])?e[t]():e[t]},k=function(){throw new Error('A "url" property or function must be specified')}}.call(this),define("backbone",["underscore"],function(e){return function(){return e.Backbone}}(this)),define("page",["underscore","backbone"],function(e,t){return t.View.extend({initialize:function(e,t){this.index=t,this.id=this.$el.attr("id"),this.parent=e.parent,this.route=this.$el.data("route")||this.id,this.bind("show",this.onShow,this),this.bind("hide",this.onHide,this)},onShow:function(){this.$el.addClass("ui-active"),this.navigate(),this.$el.prev().removeClass("ui-hidden"),this.$el.prev().prev().addClass("ui-hidden"),this.$el.next().removeClass("ui-hidden"),this.$el.next().next().addClass("ui-hidden")},onHide:function(){this.$el.removeClass("ui-active")},show:function(e,t){t=t||0;var n=new $.Deferred,r=$(".ui-active").index(),i=e||(r===this.index?600:600*this.index);return $("html,body").stop().animate({scrollTop:this.$el.data("height")+t},i,"easeInOutExpo",function(){n.resolve()}),n.promise()},navigate:function(){return $("html,body").is(":animated")===!1&&Boulderjs.router.navigate(this.route,!1),this}})});var Sylvester={version:"0.1.3",precision:1e-6};Matrix.prototype={e:function(e,t){return e<1||e>this.elements.length||t<1||t>this.elements[0].length?null:this.elements[e-1][t-1]},map:function(e){var t=[],n=this.elements.length,r=n,i,s,o=this.elements[0].length,u;do{i=r-n,s=o,t[i]=[];do u=o-s,t[i][u]=e(this.elements[i][u],i+1,u+1);while(--s)}while(--n);return Matrix.create(t)},multiply:function(e){if(!e.elements)return this.map(function(t){return t*e});var t=e.modulus?!0:!1,n=e.elements||e;typeof n[0][0]=="undefined"&&(n=Matrix.create(n).elements);if(!this.canMultiplyFromLeft(n))return null;var r=this.elements.length,i=r,s,o,u=n[0].length,a,f=this.elements[0].length,l=[],c,h,p;do{s=i-r,l[s]=[],o=u;do{a=u-o,c=0,h=f;do p=f-h,c+=this.elements[s][p]*n[p][a];while(--h);l[s][a]=c}while(--o)}while(--r);var n=Matrix.create(l);return t?n.col(1):n},x:function(e){return this.multiply(e)},canMultiplyFromLeft:function(e){var t=e.elements||e;return typeof t[0][0]=="undefined"&&(t=Matrix.create(t).elements),this.elements[0].length==t.length},setElements:function(e){var t,n=e.elements||e;if(typeof n[0][0]!="undefined"){var r=n.length,i=r,s,o,u;this.elements=[];do{t=i-r,s=n[t].length,o=s,this.elements[t]=[];do u=o-s,this.elements[t][u]=n[t][u];while(--s)}while(--r);return this}var a=n.length,f=a;this.elements=[];do t=f-a,this.elements.push([n[t]]);while(--a);return this}},Matrix.create=function(e){var t=new Matrix;return t.setElements(e)},$M=Matrix.create,function(e){if(!e.cssHooks)throw"jQuery 1.4.3+ is needed for this plugin to work";var t="transform",n,r,i,o,u,a=t.charAt(0).toUpperCase()+t.slice(1),f=["Moz","Webkit","O","MS"],l=document.createElement("div");if(t in l.style)r=t,i=l.style.perspective!==undefined;else for(var c=0;c<f.length;c++){n=f[c]+a;if(n in l.style){r=n,f[c]+"Perspective"in l.style?i=!0:o=!0;break}}r||(u="filter"in l.style,r="filter"),l=null,e.support[t]=r;var h=r,p={rotateX:{defaultValue:0,matrix:function(e){return i?$M([[1,0,0,0],[0,Math.cos(e),Math.sin(-e),0],[0,Math.sin(e),Math.cos(e),0],[0,0,0,1]]):$M([[1,0,0],[0,1,0],[0,0,1]])}},rotateY:{defaultValue:0,matrix:function(e){return i?$M([[Math.cos(e),0,Math.sin(e),0],[0,1,0,0],[Math.sin(-e),0,Math.cos(e),0],[0,0,0,1]]):$M([[1,0,0],[0,1,0],[0,0,1]])}},rotateZ:{defaultValue:0,matrix:function(e){return i?$M([[Math.cos(e),Math.sin(-e),0,0],[Math.sin(e),Math.cos(e),0,0],[0,0,1,0],[0,0,0,1]]):$M([[Math.cos(e),Math.sin(-e),0],[Math.sin(e),Math.cos(e),0],[0,0,1]])}},scale:{defaultValue:1,matrix:function(e){return i?$M([[e,0,0,0],[0,e,0,0],[0,0,e,0],[0,0,0,1]]):$M([[e,0,0],[0,e,0],[0,0,1]])}},translateX:{defaultValue:0,matrix:function(e){return i?$M([[1,0,0,0],[0,1,0,0],[0,0,1,0],[e,0,0,1]]):$M([[1,0,0],[0,1,0],[e,0,1]])}},translateY:{defaultValue:0,matrix:function(e){return i?$M([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,e,0,1]]):$M([[1,0,0],[0,1,0],[0,e,1]])}},translateZ:{defaultValue:0,matrix:function(e){return i?$M([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,e,1]]):$M([[1,0,0],[0,1,0],[0,0,1]])}}},d=function(t){var n=e(t).data("transforms"),r;i?r=$M([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]):r=$M([[1,0,0],[0,1,0],[0,0,1]]);for(var a in p)r=r.x(p[a].matrix(n[a]||p[a].defaultValue));i?(s="matrix3d(",s+=r.e(1,1).toFixed(10)+","+r.e(1,2).toFixed(10)+","+r.e(1,3).toFixed(10)+","+r.e(1,4).toFixed(10)+",",s+=r.e(2,1).toFixed(10)+","+r.e(2,2).toFixed(10)+","+r.e(2,3).toFixed(10)+","+r.e(2,4).toFixed(10)+",",s+=r.e(3,1).toFixed(10)+","+r.e(3,2).toFixed(10)+","+r.e(3,3).toFixed(10)+","+r.e(3,4).toFixed(10)+",",s+=r.e(4,1).toFixed(10)+","+r.e(4,2).toFixed(10)+","+r.e(4,3).toFixed(10)+","+r.e(4,4).toFixed(10),s+=")"):o?(s="matrix(",s+=r.e(1,1).toFixed(10)+","+r.e(1,2).toFixed(10)+",",s+=r.e(2,1).toFixed(10)+","+r.e(2,2).toFixed(10)+",",s+=r.e(3,1).toFixed(10)+"px,"+r.e(3,2).toFixed(10)+"px",s+=")"):u&&(s="progid:DXImageTransform.Microsoft.",s+="Matrix(",s+="M11="+r.e(1,1).toFixed(10)+",",s+="M12="+r.e(1,2).toFixed(10)+",",s+="M21="+r.e(2,1).toFixed(10)+",",s+="M22="+r.e(2,2).toFixed(10)+",",s+="SizingMethod='auto expand'",s+=")",t.style.top=r.e(3,1),t.style.left=r.e(3,2)),t.style[h]=s},v=function(t){return e.fx.step[t]=function(n){e.cssHooks[t].set(n.elem,n.now+n.unit)},{get:function(n,r,i){var s=e(n).data("transforms");return s===undefined&&(s={},e(n).data("transforms",s)),s[t]||p[t].defaultValue},set:function(n,r){var i=e(n).data("transforms");i===undefined&&(i={});var s=p[t];typeof s.apply=="function"?i[t]=s.apply(i[t]||s.defaultValue,r):i[t]=r,e(n).data("transforms",i),d(n)}}};if(h)for(var m in p)e.cssHooks[m]=v(m),e.cssNumber[m]=!0}(jQuery),define("transform",function(){}),jQuery.easing.jswing=jQuery.easing.swing,jQuery.extend(jQuery.easing,{def:"easeOutQuad",swing:function(e,t,n,r,i){return jQuery.easing[jQuery.easing.def](e,t,n,r,i)},easeInQuad:function(e,t,n,r,i){return r*(t/=i)*t+n},easeOutQuad:function(e,t,n,r,i){return-r*(t/=i)*(t-2)+n},easeInOutQuad:function(e,t,n,r,i){return(t/=i/2)<1?r/2*t*t+n:-r/2*(--t*(t-2)-1)+n},easeInCubic:function(e,t,n,r,i){return r*(t/=i)*t*t+n},easeOutCubic:function(e,t,n,r,i){return r*((t=t/i-1)*t*t+1)+n},easeInOutCubic:function(e,t,n,r,i){return(t/=i/2)<1?r/2*t*t*t+n:r/2*((t-=2)*t*t+2)+n},easeInQuart:function(e,t,n,r,i){return r*(t/=i)*t*t*t+n},easeOutQuart:function(e,t,n,r,i){return-r*((t=t/i-1)*t*t*t-1)+n},easeInOutQuart:function(e,t,n,r,i){return(t/=i/2)<1?r/2*t*t*t*t+n:-r/2*((t-=2)*t*t*t-2)+n},easeInQuint:function(e,t,n,r,i){return r*(t/=i)*t*t*t*t+n},easeOutQuint:function(e,t,n,r,i){return r*((t=t/i-1)*t*t*t*t+1)+n},easeInOutQuint:function(e,t,n,r,i){return(t/=i/2)<1?r/2*t*t*t*t*t+n:r/2*((t-=2)*t*t*t*t+2)+n},easeInSine:function(e,t,n,r,i){return-r*Math.cos(t/i*(Math.PI/2))+r+n},easeOutSine:function(e,t,n,r,i){return r*Math.sin(t/i*(Math.PI/2))+n},easeInOutSine:function(e,t,n,r,i){return-r/2*(Math.cos(Math.PI*t/i)-1)+n},easeInExpo:function(e,t,n,r,i){return t==0?n:r*Math.pow(2,10*(t/i-1))+n},easeOutExpo:function(e,t,n,r,i){return t==i?n+r:r*(-Math.pow(2,-10*t/i)+1)+n},easeInOutExpo:function(e,t,n,r,i){return t==0?n:t==i?n+r:(t/=i/2)<1?r/2*Math.pow(2,10*(t-1))+n:r/2*(-Math.pow(2,-10*--t)+2)+n},easeInCirc:function(e,t,n,r,i){return-r*(Math.sqrt(1-(t/=i)*t)-1)+n},easeOutCirc:function(e,t,n,r,i){return r*Math.sqrt(1-(t=t/i-1)*t)+n},easeInOutCirc:function(e,t,n,r,i){return(t/=i/2)<1?-r/2*(Math.sqrt(1-t*t)-1)+n:r/2*(Math.sqrt(1-(t-=2)*t)+1)+n},easeInElastic:function(e,t,n,r,i){var s=1.70158,o=0,u=r;if(t==0)return n;if((t/=i)==1)return n+r;o||(o=i*.3);if(u<Math.abs(r)){u=r;var s=o/4}else var s=o/(2*Math.PI)*Math.asin(r/u);return-(u*Math.pow(2,10*(t-=1))*Math.sin((t*i-s)*2*Math.PI/o))+n},easeOutElastic:function(e,t,n,r,i){var s=1.70158,o=0,u=r;if(t==0)return n;if((t/=i)==1)return n+r;o||(o=i*.3);if(u<Math.abs(r)){u=r;var s=o/4}else var s=o/(2*Math.PI)*Math.asin(r/u);return u*Math.pow(2,-10*t)*Math.sin((t*i-s)*2*Math.PI/o)+r+n},easeInOutElastic:function(e,t,n,r,i){var s=1.70158,o=0,u=r;if(t==0)return n;if((t/=i/2)==2)return n+r;o||(o=i*.3*1.5);if(u<Math.abs(r)){u=r;var s=o/4}else var s=o/(2*Math.PI)*Math.asin(r/u);return t<1?-0.5*u*Math.pow(2,10*(t-=1))*Math.sin((t*i-s)*2*Math.PI/o)+n:u*Math.pow(2,-10*(t-=1))*Math.sin((t*i-s)*2*Math.PI/o)*.5+r+n},easeInBack:function(e,t,n,r,i,s){return s==undefined&&(s=1.70158),r*(t/=i)*t*((s+1)*t-s)+n},easeOutBack:function(e,t,n,r,i,s){return s==undefined&&(s=1.70158),r*((t=t/i-1)*t*((s+1)*t+s)+1)+n},easeInOutBack:function(e,t,n,r,i,s){return s==undefined&&(s=1.70158),(t/=i/2)<1?r/2*t*t*(((s*=1.525)+1)*t-s)+n:r/2*((t-=2)*t*(((s*=1.525)+1)*t+s)+2)+n},easeInBounce:function(e,t,n,r,i){return r-jQuery.easing.easeOutBounce(e,i-t,0,r,i)+n},easeOutBounce:function(e,t,n,r,i){return(t/=i)<1/2.75?r*7.5625*t*t+n:t<2/2.75?r*(7.5625*(t-=1.5/2.75)*t+.75)+n:t<2.5/2.75?r*(7.5625*(t-=2.25/2.75)*t+.9375)+n:r*(7.5625*(t-=2.625/2.75)*t+.984375)+n},easeInOutBounce:function(e,t,n,r,i){return t<i/2?jQuery.easing.easeInBounce(e,t*2,0,r,i)*.5+n:jQuery.easing.easeOutBounce(e,t*2-i,0,r,i)*.5+r*.5+n}}),define("easing",function(){}),define("layout",["underscore","backbone","page","transform","easing"],function(e,t,n){return t.View.extend({el:$("#main"),initialize:function(e){this.initializePages(),this.scroll(),this.keyboard();var t=this;return $(window).on("resize",function(){t.initializePages()}),this},active_index:{},pages:{},getPage:function(t){return e(this.pages).find(function(e){if(e.id==t||e.route==t)return!0})},initializePages:function(){var e=0,t=this;this.$("article").each(function(r,i){var s=$(i);t.pages[i.id]=new n({el:s,parent:t},r),t.pages[i.id].render(),s.css("z-index",200-r).data("height",e),e+=s.height()}),this.$el.css("height",e)},scroll:function(){var t=this,n=$(window),r=n.scrollTop();n.on("scroll",e.throttle(function(e){var i=t.$(".ui-active"),s=n.scrollTop(),o=i.data("height"),u=s-o;t.active_index=i.index(),i.css({translateY:"-"+u});if(u<0)return t.setActive("prev");if(i.height()-u<=0)return t.setActive("next");r=s},30))},setActive:function(e){e=e||"next";var t=this.$(".ui-active"),n=t[e]();e==="prev"&&t.css("translateY",0),n.length&&(this.pages[t.attr("id")].trigger("hide"),this.pages[n.attr("id")].trigger("show"))},navigate:function(e){e=e||"next";var t=this.$(".ui-active"),n=t[e](),r=$(window),i=t.find(".fragment").not("h1, .js-show").first();if(e==="next"&&i.length){i.addClass("js-show");return}n.length&&(n=this.pages[n.attr("id")],n.show(600).done(function(){e==="prev"&&$("html,body").stop(),n.navigate()}))},keyboard:function(){function r(e){if($("html,body").is(":animated")===!0)return;var t=e.which;if(t in n)return n[t](),!1}var t=this,n={};n[40]=n[39]=function(){t.navigate("next")},n[38]=n[37]=function(){t.navigate("prev")},$(window).on("keydown",e.throttle(r,100))}})}),require(["underscore","backbone","layout"],function(e,t,n){$(function(){var e={};window.Boulderjs=e;var r=t.Router.extend({routes:{":page":"page"},page:function(t){if(!t)return;try{e.view.getPage(t).show()}catch(n){throw new Error("404 Not Found!")}}});e.router=new r({pushState:!1}),e.view=new n,$(document).delegate("a","click",function(t){var n=$(this).attr("href"),r=this.protocol+"//";n.slice(r.length)!==r&&(t.preventDefault(),e.router.navigate(n,!0))}),t.history.start({pushState:!0})})}),define("main",function(){}),require.config({deps:["main"],paths:{underscore:"../assets/js/underscore",backbone:"../assets/js/backbone",transform:"../assets/js/transformjs.1.0.beta.2",easing:"../assets/js/jquery.easing.1.3"},shim:{backbone:{deps:["underscore"],exports:"Backbone"},underscore:{exports:"_"},transform:[],easing:[]}}),define("config",function(){})