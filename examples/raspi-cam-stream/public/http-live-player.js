// https://github.com/131/h264-live-player licensed under ISC

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.WSAvcPlayer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && 'WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if ('env' in (typeof process === 'undefined' ? {} : process)) {
    r = process.env.DEBUG;
  }
  
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":2}],2:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug.debug = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting
    args = exports.formatArgs.apply(self, args);

    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/[\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":3}],3:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000
var m = s * 60
var h = m * 60
var d = h * 24
var y = d * 365.25

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function (val, options) {
  options = options || {}
  var type = typeof val
  if (type === 'string' && val.length > 0) {
    return parse(val)
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ?
			fmtLong(val) :
			fmtShort(val)
  }
  throw new Error('val is not a non-empty string or a valid number. val=' + JSON.stringify(val))
}

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str)
  if (str.length > 10000) {
    return
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str)
  if (!match) {
    return
  }
  var n = parseFloat(match[1])
  var type = (match[2] || 'ms').toLowerCase()
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y
    case 'days':
    case 'day':
    case 'd':
      return n * d
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n
    default:
      return undefined
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd'
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h'
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm'
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's'
  }
  return ms + 'ms'
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms'
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name
  }
  return Math.ceil(ms / n) + ' ' + name + 's'
}

},{}],4:[function(require,module,exports){
(function (__dirname){
// universal module definition
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.Decoder = factory();
    }
}(this, function () {
  
  var global;
  
  function initglobal(){
    global = this;
    if (!global){
      if (typeof window != "undefined"){
        global = window;
      }else if (typeof self != "undefined"){
        global = self;
      };
    };
  };
  initglobal();
  
  
  function error(message) {
    console.error(message);
    console.trace();
  };

  
  function assert(condition, message) {
    if (!condition) {
      error(message);
    };
  };
  
  
  return (function(){
    "use strict";



  
  var getModule = function(_broadwayOnHeadersDecoded, _broadwayOnPictureDecoded){
    
    var window = this;
    //console.log(typeof window);
    
    window._broadwayOnHeadersDecoded = _broadwayOnHeadersDecoded;
    window._broadwayOnPictureDecoded = _broadwayOnPictureDecoded;
    
    var Module = {
      'print': function(text) { console.log('stdout: ' + text); },
      'printErr': function(text) { console.log('stderr: ' + text); }
    };
    
    
    /*
    
      The reason why this is all packed into one file is that this file can also function as worker.
      you can integrate the file into your build system and provide the original file to be loaded into a worker.
    
    */
    
function d(a){throw a;}var g=void 0,i=!0,k=null,m=!1;function n(){return function(){}}var p;p||(p=eval("(function() { try { return Module || {} } catch(e) { return {} } })()"));var aa={},r;for(r in p)p.hasOwnProperty(r)&&(aa[r]=p[r]);var t="object"===typeof process&&"function"===typeof null,ba="object"===typeof window,ca="function"===typeof importScripts,da=!ba&&!t&&!ca;
if(t){p.print||(p.print=function(a){process.stdout.write(a+"\n")});p.printErr||(p.printErr=function(a){process.stderr.write(a+"\n")});var fa=(null)("fs"),ga=(null)("path");p.read=function(a,b){var a=ga.normalize(a),c=fa.readFileSync(a);!c&&a!=ga.resolve(a)&&(a=path.join(__dirname,"..","src",a),c=fa.readFileSync(a));c&&!b&&(c=c.toString());return c};p.readBinary=function(a){return p.read(a,i)};p.load=function(a){ha(read(a))};p.thisProgram=1<process.argv.length?process.argv[1].replace(/\\/g,"/"):
"unknown-program";p.arguments=process.argv.slice(2);"undefined"!==typeof module&&(module.exports=p);process.on("uncaughtException",function(a){a instanceof ia||d(a)})}else da?(p.print||(p.print=print),"undefined"!=typeof printErr&&(p.printErr=printErr),p.read="undefined"!=typeof read?read:function(){d("no read() available (jsc?)")},p.readBinary=function(a){if("function"===typeof readbuffer)return new Uint8Array(readbuffer(a));a=read(a,"binary");w("object"===typeof a);return a},"undefined"!=typeof scriptArgs?
p.arguments=scriptArgs:"undefined"!=typeof arguments&&(p.arguments=arguments),this.Module=p,eval("if (typeof gc === 'function' && gc.toString().indexOf('[native code]') > 0) var gc = undefined")):ba||ca?(p.read=function(a){var b=new XMLHttpRequest;b.open("GET",a,m);b.send(k);return b.responseText},"undefined"!=typeof arguments&&(p.arguments=arguments),"undefined"!==typeof console?(p.print||(p.print=function(a){console.log(a)}),p.printErr||(p.printErr=function(a){console.log(a)})):p.print||(p.print=
n()),ba?window.Module=p:p.load=importScripts):d("Unknown runtime environment. Where are we?");function ha(a){eval.call(k,a)}!p.load&&p.read&&(p.load=function(a){ha(p.read(a))});p.print||(p.print=n());p.printErr||(p.printErr=p.print);p.arguments||(p.arguments=[]);p.thisProgram||(p.thisProgram="./this.program");p.print=p.print;p.fa=p.printErr;p.preRun=[];p.postRun=[];for(r in aa)aa.hasOwnProperty(r)&&(p[r]=aa[r]);
var z={Yd:function(a){ja=a},xd:function(){return ja},Tb:function(){return y},Sb:function(a){y=a},oc:function(a){switch(a){case "i1":case "i8":return 1;case "i16":return 2;case "i32":return 4;case "i64":return 8;case "float":return 4;case "double":return 8;default:return"*"===a[a.length-1]?z.ia:"i"===a[0]?(a=parseInt(a.substr(1)),w(0===a%8),a/8):0}},vd:function(a){return Math.max(z.oc(a),z.ia)},Qf:16,ng:function(a,b,c){return!c&&("i64"==a||"double"==a)?8:!a?Math.min(b,8):Math.min(b||(a?z.vd(a):0),
z.ia)},Fa:function(a,b,c){return c&&c.length?(c.splice||(c=Array.prototype.slice.call(c)),c.splice(0,0,b),p["dynCall_"+a].apply(k,c)):p["dynCall_"+a].call(k,b)},eb:[],Vc:function(a){for(var b=0;b<z.eb.length;b++)if(!z.eb[b])return z.eb[b]=a,2*(1+b);d("Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.")},Sd:function(a){z.eb[(a-2)/2]=k},og:function(a,b){z.wb||(z.wb={});var c=z.wb[a];if(c)return c;for(var c=[],e=0;e<b;e++)c.push(String.fromCharCode(36)+e);
e=ka(a);'"'===e[0]&&(e.indexOf('"',1)===e.length-1?e=e.substr(1,e.length-2):A("invalid EM_ASM input |"+e+"|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)"));try{var f=eval("(function(Module, FS) { return function("+c.join(",")+"){ "+e+" } })")(p,"undefined"!==typeof B?B:k)}catch(h){p.fa("error in executing inline EM_ASM code: "+h+" on: \n\n"+e+"\n\nwith args |"+c+"| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)"),d(h)}return z.wb[a]=
f},Aa:function(a){z.Aa.Rb||(z.Aa.Rb={});z.Aa.Rb[a]||(z.Aa.Rb[a]=1,p.fa(a))},Cb:{},rg:function(a,b){w(b);z.Cb[b]||(z.Cb[b]={});var c=z.Cb[b];c[a]||(c[a]=function(){return z.Fa(b,a,arguments)});return c[a]},Da:function(){var a=[],b=0;this.nb=function(c){c&=255;if(0==a.length){if(0==(c&128))return String.fromCharCode(c);a.push(c);b=192==(c&224)?1:224==(c&240)?2:3;return""}if(b&&(a.push(c),b--,0<b))return"";var c=a[0],e=a[1],f=a[2],h=a[3];2==a.length?c=String.fromCharCode((c&31)<<6|e&63):3==a.length?
c=String.fromCharCode((c&15)<<12|(e&63)<<6|f&63):(c=(c&7)<<18|(e&63)<<12|(f&63)<<6|h&63,c=String.fromCharCode(((c-65536)/1024|0)+55296,(c-65536)%1024+56320));a.length=0;return c};this.Ac=function(a){for(var a=unescape(encodeURIComponent(a)),b=[],f=0;f<a.length;f++)b.push(a.charCodeAt(f));return b}},pg:function(){d("You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work")},pb:function(a){var b=y;y=y+a|0;y=y+15&-16;return b},Ec:function(a){var b=
D;D=D+a|0;D=D+15&-16;return b},bb:function(a){var b=E;E=E+a|0;E=E+15&-16;E>=F&&A("Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value "+F+", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.");return b},ub:function(a,b){return Math.ceil(a/(b?b:16))*(b?b:16)},Fg:function(a,b,c){return c?+(a>>>0)+4294967296*+(b>>>0):+(a>>>0)+4294967296*
+(b|0)},Pc:8,ia:4,Rf:0};p.Runtime=z;z.addFunction=z.Vc;z.removeFunction=z.Sd;var H=m,la,ma,ja;function w(a,b){a||A("Assertion failed: "+b)}function na(a){var b=p["_"+a];if(!b)try{b=eval("_"+a)}catch(c){}w(b,"Cannot call unknown function "+a+" (perhaps LLVM optimizations or closure removed it?)");return b}var oa,pa;
(function(){function a(a){a=a.toString().match(e).slice(1);return{arguments:a[0],body:a[1],returnValue:a[2]}}var b={stackSave:function(){z.Tb()},stackRestore:function(){z.Sb()},arrayToC:function(a){var b=z.pb(a.length);qa(a,b);return b},stringToC:function(a){var b=0;a!==k&&(a!==g&&0!==a)&&(b=z.pb((a.length<<2)+1),ra(a,b));return b}},c={string:b.stringToC,array:b.arrayToC};pa=function(a,b,e,f){var h=na(a),s=[],a=0;if(f)for(var v=0;v<f.length;v++){var G=c[e[v]];G?(0===a&&(a=z.Tb()),s[v]=G(f[v])):s[v]=
f[v]}e=h.apply(k,s);"string"===b&&(e=ka(e));0!==a&&z.Sb(a);return e};var e=/^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/,f={},h;for(h in b)b.hasOwnProperty(h)&&(f[h]=a(b[h]));oa=function(b,c,e){var e=e||[],h=na(b),b=e.every(function(a){return"number"===a}),x="string"!==c;if(x&&b)return h;var s=e.map(function(a,b){return"$"+b}),c="(function("+s.join(",")+") {",v=e.length;if(!b)for(var c=c+("var stack = "+f.stackSave.body+";"),G=0;G<v;G++){var ua=s[G],ea=e[G];"number"!==
ea&&(ea=f[ea+"ToC"],c+="var "+ea.arguments+" = "+ua+";",c+=ea.body+";",c+=ua+"="+ea.returnValue+";")}e=a(function(){return h}).returnValue;c+="var ret = "+e+"("+s.join(",")+");";x||(e=a(function(){return ka}).returnValue,c+="ret = "+e+"(ret);");b||(c+=f.stackRestore.body.replace("()","(stack)")+";");return eval(c+"return ret})")}})();p.cwrap=oa;p.ccall=pa;
function sa(a,b,c){c=c||"i8";"*"===c.charAt(c.length-1)&&(c="i32");switch(c){case "i1":I[a>>0]=b;break;case "i8":I[a>>0]=b;break;case "i16":J[a>>1]=b;break;case "i32":K[a>>2]=b;break;case "i64":ma=[b>>>0,(la=b,1<=+ta(la)?0<la?(va(+wa(la/4294967296),4294967295)|0)>>>0:~~+xa((la-+(~~la>>>0))/4294967296)>>>0:0)];K[a>>2]=ma[0];K[a+4>>2]=ma[1];break;case "float":ya[a>>2]=b;break;case "double":za[a>>3]=b;break;default:A("invalid type for setValue: "+c)}}p.setValue=sa;
function Aa(a,b){b=b||"i8";"*"===b.charAt(b.length-1)&&(b="i32");switch(b){case "i1":return I[a>>0];case "i8":return I[a>>0];case "i16":return J[a>>1];case "i32":return K[a>>2];case "i64":return K[a>>2];case "float":return ya[a>>2];case "double":return za[a>>3];default:A("invalid type for setValue: "+b)}return k}p.getValue=Aa;var L=2,Ba=4;p.ALLOC_NORMAL=0;p.ALLOC_STACK=1;p.ALLOC_STATIC=L;p.ALLOC_DYNAMIC=3;p.ALLOC_NONE=Ba;
function M(a,b,c,e){var f,h;"number"===typeof a?(f=i,h=a):(f=m,h=a.length);var j="string"===typeof b?b:k,c=c==Ba?e:[Ca,z.pb,z.Ec,z.bb][c===g?L:c](Math.max(h,j?1:b.length));if(f){e=c;w(0==(c&3));for(a=c+(h&-4);e<a;e+=4)K[e>>2]=0;for(a=c+h;e<a;)I[e++>>0]=0;return c}if("i8"===j)return a.subarray||a.slice?N.set(a,c):N.set(new Uint8Array(a),c),c;for(var e=0,l,u;e<h;){var q=a[e];"function"===typeof q&&(q=z.sg(q));f=j||b[e];0===f?e++:("i64"==f&&(f="i32"),sa(c+e,q,f),u!==f&&(l=z.oc(f),u=f),e+=l)}return c}
p.allocate=M;function ka(a,b){if(0===b||!a)return"";for(var c=m,e,f=0;;){e=N[a+f>>0];if(128<=e)c=i;else if(0==e&&!b)break;f++;if(b&&f==b)break}b||(b=f);var h="";if(!c){for(;0<b;)e=String.fromCharCode.apply(String,N.subarray(a,a+Math.min(b,1024))),h=h?h+e:e,a+=1024,b-=1024;return h}c=new z.Da;for(f=0;f<b;f++)e=N[a+f>>0],h+=c.nb(e);return h}p.Pointer_stringify=ka;p.UTF16ToString=function(a){for(var b=0,c="";;){var e=J[a+2*b>>1];if(0==e)return c;++b;c+=String.fromCharCode(e)}};
p.stringToUTF16=function(a,b){for(var c=0;c<a.length;++c)J[b+2*c>>1]=a.charCodeAt(c);J[b+2*a.length>>1]=0};p.UTF32ToString=function(a){for(var b=0,c="";;){var e=K[a+4*b>>2];if(0==e)return c;++b;65536<=e?(e-=65536,c+=String.fromCharCode(55296|e>>10,56320|e&1023)):c+=String.fromCharCode(e)}};p.stringToUTF32=function(a,b){for(var c=0,e=0;e<a.length;++e){var f=a.charCodeAt(e);if(55296<=f&&57343>=f)var h=a.charCodeAt(++e),f=65536+((f&1023)<<10)|h&1023;K[b+4*c>>2]=f;++c}K[b+4*c>>2]=0};
function Da(a){function b(c,e,f){var e=e||Infinity,h="",j=[],s;if("N"===a[l]){l++;"K"===a[l]&&l++;for(s=[];"E"!==a[l];)if("S"===a[l]){l++;var C=a.indexOf("_",l);s.push(q[a.substring(l,C)||0]||"?");l=C+1}else if("C"===a[l])s.push(s[s.length-1]),l+=2;else{var C=parseInt(a.substr(l)),P=C.toString().length;if(!C||!P){l--;break}var sb=a.substr(l+P,C);s.push(sb);q.push(sb);l+=P+C}l++;s=s.join("::");e--;if(0===e)return c?[s]:s}else if(("K"===a[l]||x&&"L"===a[l])&&l++,C=parseInt(a.substr(l)))P=C.toString().length,
s=a.substr(l+P,C),l+=P+C;x=m;"I"===a[l]?(l++,C=b(i),P=b(i,1,i),h+=P[0]+" "+s+"<"+C.join(", ")+">"):h=s;a:for(;l<a.length&&0<e--;)if(s=a[l++],s in u)j.push(u[s]);else switch(s){case "P":j.push(b(i,1,i)[0]+"*");break;case "R":j.push(b(i,1,i)[0]+"&");break;case "L":l++;C=a.indexOf("E",l)-l;j.push(a.substr(l,C));l+=C+2;break;case "A":C=parseInt(a.substr(l));l+=C.toString().length;"_"!==a[l]&&d("?");l++;j.push(b(i,1,i)[0]+" ["+C+"]");break;case "E":break a;default:h+="?"+s;break a}!f&&(1===j.length&&"void"===
j[0])&&(j=[]);return c?(h&&j.push(h+"?"),j):h+("("+j.join(", ")+")")}var c=!!p.___cxa_demangle;if(c)try{var e=Ca(a.length);ra(a.substr(1),e);var f=Ca(4),h=p.___cxa_demangle(e,0,0,f);if(0===Aa(f,"i32")&&h)return ka(h)}catch(j){}finally{e&&Ea(e),f&&Ea(f),h&&Ea(h)}var l=3,u={v:"void",b:"bool",c:"char",s:"short",i:"int",l:"long",f:"float",d:"double",w:"wchar_t",a:"signed char",h:"unsigned char",t:"unsigned short",j:"unsigned int",m:"unsigned long",x:"long long",y:"unsigned long long",z:"..."},q=[],x=
i,e=a;try{if("Object._main"==a||"_main"==a)return"main()";"number"===typeof a&&(a=ka(a));if("_"!==a[0]||"_"!==a[1]||"Z"!==a[2])return a;switch(a[3]){case "n":return"operator new()";case "d":return"operator delete()"}e=b()}catch(s){e+="?"}0<=e.indexOf("?")&&!c&&z.Aa("warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling");return e}
function Fa(){var a;a:{a=Error();if(!a.stack){try{d(Error(0))}catch(b){a=b}if(!a.stack){a="(no stack trace available)";break a}}a=a.stack.toString()}return a.replace(/__Z[\w\d_]+/g,function(a){var b=Da(a);return a===b?a:a+" ["+b+"]"})}p.stackTrace=function(){return Fa()};for(var I,N,J,Ga,K,Ha,ya,za,Ia=0,D=0,Ja=0,y=0,Ka=0,La=0,E=0,Ma=p.TOTAL_STACK||5242880,F=p.TOTAL_MEMORY||52428800,O=65536;O<F||O<2*Ma;)O=16777216>O?2*O:O+16777216;
O!==F&&(p.fa("increasing TOTAL_MEMORY to "+O+" to be compliant with the asm.js spec"),F=O);w("undefined"!==typeof Int32Array&&"undefined"!==typeof Float64Array&&!!(new Int32Array(1)).subarray&&!!(new Int32Array(1)).set,"JS engine does not provide full typed array support");var Q=new ArrayBuffer(F);I=new Int8Array(Q);J=new Int16Array(Q);K=new Int32Array(Q);N=new Uint8Array(Q);Ga=new Uint16Array(Q);Ha=new Uint32Array(Q);ya=new Float32Array(Q);za=new Float64Array(Q);K[0]=255;w(255===N[0]&&0===N[3],"Typed arrays 2 must be run on a little-endian system");
p.HEAP=g;p.buffer=Q;p.HEAP8=I;p.HEAP16=J;p.HEAP32=K;p.HEAPU8=N;p.HEAPU16=Ga;p.HEAPU32=Ha;p.HEAPF32=ya;p.HEAPF64=za;function Na(a){for(;0<a.length;){var b=a.shift();if("function"==typeof b)b();else{var c=b.ja;"number"===typeof c?b.Xa===g?z.Fa("v",c):z.Fa("vi",c,[b.Xa]):c(b.Xa===g?k:b.Xa)}}}var Oa=[],R=[],Pa=[],Qa=[],Ra=[],Sa=m;function Ta(a){Oa.unshift(a)}p.addOnPreRun=p.Xf=Ta;p.addOnInit=p.Uf=function(a){R.unshift(a)};p.addOnPreMain=p.Wf=function(a){Pa.unshift(a)};p.addOnExit=p.Tf=function(a){Qa.unshift(a)};
function Ua(a){Ra.unshift(a)}p.addOnPostRun=p.Vf=Ua;function Va(a,b,c){a=(new z.Da).Ac(a);c&&(a.length=c);b||a.push(0);return a}p.intArrayFromString=Va;p.intArrayToString=function(a){for(var b=[],c=0;c<a.length;c++){var e=a[c];255<e&&(e&=255);b.push(String.fromCharCode(e))}return b.join("")};function ra(a,b,c){a=Va(a,c);for(c=0;c<a.length;)I[b+c>>0]=a[c],c+=1}p.writeStringToMemory=ra;function qa(a,b){for(var c=0;c<a.length;c++)I[b+c>>0]=a[c]}p.writeArrayToMemory=qa;
p.writeAsciiToMemory=function(a,b,c){for(var e=0;e<a.length;e++)I[b+e>>0]=a.charCodeAt(e);c||(I[b+a.length>>0]=0)};if(!Math.imul||-5!==Math.imul(4294967295,5))Math.imul=function(a,b){var c=a&65535,e=b&65535;return c*e+((a>>>16)*e+c*(b>>>16)<<16)|0};Math.vg=Math.imul;var ta=Math.abs,xa=Math.ceil,wa=Math.floor,va=Math.min,S=0,Wa=k,Xa=k;function Ya(){S++;p.monitorRunDependencies&&p.monitorRunDependencies(S)}p.addRunDependency=Ya;
function Za(){S--;p.monitorRunDependencies&&p.monitorRunDependencies(S);if(0==S&&(Wa!==k&&(clearInterval(Wa),Wa=k),Xa)){var a=Xa;Xa=k;a()}}p.removeRunDependency=Za;p.preloadedImages={};p.preloadedAudios={};var T=k,Ia=8,D=Ia+7808;R.push();
M([0,0,0,0,0,0,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,7,7,7,7,7,7,8,8,8,8,0,0,0,0,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,4,5,0,1,2,3,0,0,0,0,10,0,0,0,13,0,0,0,16,0,0,0,11,0,0,0,14,0,0,0,18,0,0,0,13,0,0,0,16,0,0,0,20,0,0,0,14,0,0,0,18,0,0,0,23,0,0,0,16,0,0,0,20,0,0,0,25,0,0,0,18,0,0,0,23,0,0,0,29,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,
0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,18,0,0,0,19,0,0,0,20,0,0,0,21,0,0,0,22,0,0,0,23,0,0,0,24,0,0,0,25,0,0,0,26,0,0,0,27,0,0,0,28,0,0,0,29,0,0,0,29,0,0,0,30,0,0,0,31,0,0,0,32,0,0,0,32,0,0,0,33,0,0,0,34,0,0,0,34,0,0,0,35,0,0,0,35,0,0,0,36,0,0,0,36,0,0,0,37,0,0,0,37,0,0,0,37,0,0,0,38,0,0,0,38,0,0,0,38,0,0,0,39,0,0,0,39,0,0,0,39,0,0,0,39,0,0,0,1,0,0,0,2,0,0,0,4,0,0,0,8,0,0,0,16,0,0,0,32,0,0,0,64,0,0,0,128,0,0,0,1,0,0,0,1,0,0,0,2,0,0,0,2,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,0,0,0,0,1,0,0,0,4,0,0,
0,5,0,0,0,2,0,0,0,3,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,12,0,0,0,13,0,0,0,10,0,0,0,11,0,0,0,14,0,0,0,15,0,0,0,47,31,15,0,23,27,29,30,7,11,13,14,39,43,45,46,16,3,5,10,12,19,21,26,28,35,37,42,44,1,2,4,8,17,18,20,24,6,9,22,25,32,33,34,36,40,38,41,0,16,1,2,4,8,32,3,5,10,12,15,47,7,11,13,14,6,9,31,35,37,42,44,33,34,36,40,39,43,45,46,17,18,20,24,19,21,26,28,23,27,29,30,22,25,38,41,17,1,0,0,0,0,0,0,34,18,1,1,0,0,0,0,50,34,18,2,0,0,0,0,67,51,34,34,18,18,2,2,83,67,51,35,18,18,2,2,19,35,67,51,99,83,2,2,0,
0,101,85,68,68,52,52,35,35,35,35,19,19,19,19,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,249,233,217,200,200,184,184,167,167,167,167,151,151,151,151,134,134,134,134,134,134,134,134,118,118,118,118,118,118,118,118,230,214,198,182,165,165,149,149,132,132,132,132,116,116,116,116,100,100,100,100,84,84,84,84,67,67,67,67,67,67,67,67,51,51,51,51,51,51,51,51,35,35,35,35,35,35,35,35,19,19,19,19,19,19,19,19,3,3,3,3,3,3,3,3,214,182,197,197,165,165,149,149,132,132,132,132,84,84,84,84,68,68,68,68,4,4,4,4,115,115,115,115,
115,115,115,115,99,99,99,99,99,99,99,99,51,51,51,51,51,51,51,51,35,35,35,35,35,35,35,35,19,19,19,19,19,19,19,19,197,181,165,5,148,148,116,116,52,52,36,36,131,131,131,131,99,99,99,99,83,83,83,83,67,67,67,67,19,19,19,19,181,149,164,164,132,132,36,36,20,20,4,4,115,115,115,115,99,99,99,99,83,83,83,83,67,67,67,67,51,51,51,51,166,6,21,21,132,132,132,132,147,147,147,147,147,147,147,147,115,115,115,115,115,115,115,115,99,99,99,99,99,99,99,99,83,83,83,83,83,83,83,83,67,67,67,67,67,67,67,67,51,51,51,51,51,
51,51,51,35,35,35,35,35,35,35,35,150,6,21,21,116,116,116,116,131,131,131,131,131,131,131,131,99,99,99,99,99,99,99,99,67,67,67,67,67,67,67,67,51,51,51,51,51,51,51,51,35,35,35,35,35,35,35,35,82,82,82,82,82,82,82,82,82,82,82,82,82,82,82,82,134,6,37,37,20,20,20,20,115,115,115,115,115,115,115,115,99,99,99,99,99,99,99,99,51,51,51,51,51,51,51,51,82,82,82,82,82,82,82,82,82,82,82,82,82,82,82,82,66,66,66,66,66,66,66,66,66,66,66,66,66,66,66,66,22,6,117,117,36,36,36,36,83,83,83,83,83,83,83,83,98,98,98,98,98,
98,98,98,98,98,98,98,98,98,98,98,66,66,66,66,66,66,66,66,66,66,66,66,66,66,66,66,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,21,5,100,100,35,35,35,35,82,82,82,82,82,82,82,82,66,66,66,66,66,66,66,66,50,50,50,50,50,50,50,50,4,20,35,35,51,51,83,83,65,65,65,65,65,65,65,65,4,20,67,67,34,34,34,34,49,49,49,49,49,49,49,49,3,19,50,50,33,33,33,33,2,18,33,33,0,0,0,0,0,0,0,0,0,0,102,32,38,16,6,8,101,24,101,24,67,16,67,16,67,16,67,16,67,16,67,16,67,16,67,16,34,8,34,8,34,8,34,8,34,8,34,8,34,8,34,8,34,8,34,
8,34,8,34,8,34,8,34,8,34,8,34,8,0,0,0,0,0,0,0,0,106,64,74,48,42,40,10,32,105,56,105,56,73,40,73,40,41,32,41,32,9,24,9,24,104,48,104,48,104,48,104,48,72,32,72,32,72,32,72,32,40,24,40,24,40,24,40,24,8,16,8,16,8,16,8,16,103,40,103,40,103,40,103,40,103,40,103,40,103,40,103,40,71,24,71,24,71,24,71,24,71,24,71,24,71,24,71,24,110,96,78,88,46,80,14,80,110,88,78,80,46,72,14,72,13,64,13,64,77,72,77,72,45,64,45,64,13,56,13,56,109,80,109,80,77,64,77,64,45,56,45,56,13,48,13,48,107,72,107,72,107,72,107,72,107,
72,107,72,107,72,107,72,75,56,75,56,75,56,75,56,75,56,75,56,75,56,75,56,43,48,43,48,43,48,43,48,43,48,43,48,43,48,43,48,11,40,11,40,11,40,11,40,11,40,11,40,11,40,11,40,0,0,0,0,47,104,47,104,16,128,80,128,48,128,16,120,112,128,80,120,48,120,16,112,112,120,80,112,48,112,16,104,111,112,111,112,79,104,79,104,47,96,47,96,15,96,15,96,111,104,111,104,79,96,79,96,47,88,47,88,15,88,15,88,0,0,0,0,0,0,0,0,102,56,70,32,38,32,6,16,102,48,70,24,38,24,6,8,101,40,101,40,37,16,37,16,100,32,100,32,100,32,100,32,100,
24,100,24,100,24,100,24,67,16,67,16,67,16,67,16,67,16,67,16,67,16,67,16,0,0,0,0,0,0,0,0,105,72,73,56,41,56,9,48,8,40,8,40,72,48,72,48,40,48,40,48,8,32,8,32,103,64,103,64,103,64,103,64,71,40,71,40,71,40,71,40,39,40,39,40,39,40,39,40,7,24,7,24,7,24,7,24,0,0,0,0,109,120,109,120,110,128,78,128,46,128,14,128,46,120,14,120,78,120,46,112,77,112,77,112,13,112,13,112,109,112,109,112,77,104,77,104,45,104,45,104,13,104,13,104,109,104,109,104,77,96,77,96,45,96,45,96,13,96,13,96,12,88,12,88,12,88,12,88,76,88,
76,88,76,88,76,88,44,88,44,88,44,88,44,88,12,80,12,80,12,80,12,80,108,96,108,96,108,96,108,96,76,80,76,80,76,80,76,80,44,80,44,80,44,80,44,80,12,72,12,72,12,72,12,72,107,88,107,88,107,88,107,88,107,88,107,88,107,88,107,88,75,72,75,72,75,72,75,72,75,72,75,72,75,72,75,72,43,72,43,72,43,72,43,72,43,72,43,72,43,72,43,72,11,64,11,64,11,64,11,64,11,64,11,64,11,64,11,64,107,80,107,80,107,80,107,80,107,80,107,80,107,80,107,80,75,64,75,64,75,64,75,64,75,64,75,64,75,64,75,64,43,64,43,64,43,64,43,64,43,64,43,
64,43,64,43,64,11,56,11,56,11,56,11,56,11,56,11,56,11,56,11,56,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,24,70,56,38,56,6,16,102,72,70,48,38,48,6,8,37,40,37,40,69,40,69,40,37,32,37,32,69,32,69,32,37,24,37,24,101,64,101,64,69,24,69,24,37,16,37,16,100,56,100,56,100,56,100,56,100,48,100,48,100,48,100,48,100,40,100,40,100,40,100,40,100,32,100,32,100,32,100,32,100,24,100,24,100,24,100,24,68,16,68,16,68,16,68,16,36,8,36,8,36,8,36,8,4,0,4,0,4,0,4,0,0,0,10,128,106,128,74,128,42,128,10,120,106,120,74,120,42,120,10,
112,106,112,74,112,42,112,10,104,41,104,41,104,9,96,9,96,73,104,73,104,41,96,41,96,9,88,9,88,105,104,105,104,73,96,73,96,41,88,41,88,9,80,9,80,104,96,104,96,104,96,104,96,72,88,72,88,72,88,72,88,40,80,40,80,40,80,40,80,8,72,8,72,8,72,8,72,104,88,104,88,104,88,104,88,72,80,72,80,72,80,72,80,40,72,40,72,40,72,40,72,8,64,8,64,8,64,8,64,7,56,7,56,7,56,7,56,7,56,7,56,7,56,7,56,7,48,7,48,7,48,7,48,7,48,7,48,7,48,7,48,71,72,71,72,71,72,71,72,71,72,71,72,71,72,71,72,7,40,7,40,7,40,7,40,7,40,7,40,7,40,7,40,
103,80,103,80,103,80,103,80,103,80,103,80,103,80,103,80,71,64,71,64,71,64,71,64,71,64,71,64,71,64,71,64,39,64,39,64,39,64,39,64,39,64,39,64,39,64,39,64,7,32,7,32,7,32,7,32,7,32,7,32,7,32,7,32,6,8,38,8,0,0,6,0,6,16,38,16,70,16,0,0,6,24,38,24,70,24,102,24,6,32,38,32,70,32,102,32,6,40,38,40,70,40,102,40,6,48,38,48,70,48,102,48,6,56,38,56,70,56,102,56,6,64,38,64,70,64,102,64,6,72,38,72,70,72,102,72,6,80,38,80,70,80,102,80,6,88,38,88,70,88,102,88,6,96,38,96,70,96,102,96,6,104,38,104,70,104,102,104,6,112,
38,112,70,112,102,112,6,120,38,120,70,120,102,120,6,128,38,128,70,128,102,128,0,0,67,16,2,0,2,0,33,8,33,8,33,8,33,8,103,32,103,32,72,32,40,32,71,24,71,24,39,24,39,24,6,32,6,32,6,32,6,32,6,24,6,24,6,24,6,24,6,16,6,16,6,16,6,16,102,24,102,24,102,24,102,24,38,16,38,16,38,16,38,16,6,8,6,8,6,8,6,8,3,0,0,0,15,0,0,0,1,0,0,0,10,0,0,0,0,0,0,0,5,0,0,0,4,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,4,0,0,0,0,0,0,0,7,0,0,0,4,0,0,0,2,0,0,0,0,0,0,0,13,0,0,0,4,0,0,0,8,0,0,0,4,0,0,0,3,
0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,12,0,0,0,3,0,0,0,19,0,0,0,1,0,0,0,18,0,0,0,0,0,0,0,17,0,0,0,4,0,0,0,16,0,0,0,3,0,0,0,23,0,0,0,1,0,0,0,22,0,0,0,0,0,0,0,21,0,0,0,4,0,0,0,20,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,4,0,0,0,1,0,0,0,255,0,0,0,4,0,0,0,1,0,0,0,15,0,0,0,2,0,0,0,10,0,0,0,4,0,0,0,5,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,9,0,0,0,255,0,0,0,12,0,0,0,4,0,0,0,7,0,0,0,255,0,0,0,2,0,0,0,4,0,0,0,13,0,0,0,255,0,0,0,8,0,0,0,1,0,0,0,19,0,0,0,2,0,0,0,18,0,0,0,4,0,
0,0,17,0,0,0,255,0,0,0,16,0,0,0,1,0,0,0,23,0,0,0,2,0,0,0,22,0,0,0,4,0,0,0,21,0,0,0,255,0,0,0,20,0,0,0,1,0,0,0,10,0,0,0,1,0,0,0,11,0,0,0,4,0,0,0,0,0,0,0,4,0,0,0,1,0,0,0,1,0,0,0,14,0,0,0,1,0,0,0,15,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,5,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,8,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,7,0,0,0,4,0,0,0,12,0,0,0,4,0,0,0,13,0,0,0,1,0,0,0,18,0,0,0,1,0,0,0,19,0,0,0,4,0,0,0,16,0,0,0,4,0,0,0,17,0,0,0,1,0,0,0,22,0,0,0,1,0,0,0,23,0,0,0,4,0,0,0,20,0,0,0,4,0,0,0,21,0,0,0,0,
0,0,0,5,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,0,0,0,0,13,0,0,0,4,0,0,0,8,0,0,0,0,0,0,0,15,0,0,0,4,0,0,0,10,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,12,0,0,0,4,0,0,0,11,0,0,0,4,0,0,0,14,0,0,0,0,0,0,0,17,0,0,0,4,0,0,0,16,0,0,0,0,0,0,0,19,0,0,0,4,0,0,0,18,0,0,0,0,0,0,0,21,0,0,0,4,0,0,0,20,0,0,0,0,0,0,0,23,0,0,0,4,0,0,0,22,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,4,0,0,0,8,0,0,0,12,0,0,0,8,0,0,0,12,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,4,0,0,0,8,0,0,0,
12,0,0,0,8,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,4,0,0,0,8,0,0,0,8,0,0,0,12,0,0,0,12,0,0,0,8,0,0,0,8,0,0,0,12,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,
109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,
235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,3,0,0,0,15,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,3,0,0,0,15,0,0,0,0,0,0,0,5,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,3,0,0,0,15,0,0,0,1,0,0,0,10,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,3,0,0,0,15,0,0,0,1,0,0,0,10,0,0,0,0,0,0,0,5,0,0,0,4,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,4,0,0,0,1,0,0,0,255,0,
0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,4,0,0,0,0,0,0,0,7,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,13,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,4,0,0,0,2,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,4,0,0,0,2,0,0,0,0,0,0,0,13,0,0,0,4,0,0,0,8,0,0,0,4,0,0,0,3,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,
0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,9,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,12,0,0,0,1,0,0,0,14,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,14,0,0,0,255,0,0,0,4,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,11,0,0,0,1,0,0,0,14,0,0,0,4,0,0,0,1,0,0,0,255,0,0,0,4,0,0,0,2,0,0,0,10,0,0,
0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,2,0,0,0,10,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,15,0,0,0,2,0,0,0,10,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,15,0,0,0,2,0,0,0,10,0,0,0,4,0,0,0,5,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,6,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,6,0,0,0,255,0,0,0,12,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,
0,0,4,0,0,0,9,0,0,0,255,0,0,0,12,0,0,0,255,0,0,0,2,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,2,0,0,0,255,0,0,0,8,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,7,0,0,0,255,0,0,0,2,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,7,0,0,0,255,0,0,0,2,0,0,0,4,0,0,0,13,0,0,0,255,0,0,0,8,0,0,0,1,0,0,0,10,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,10,0,0,0,4,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,10,0,0,0,1,0,0,0,11,0,0,0,255,0,
0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,10,0,0,0,1,0,0,0,11,0,0,0,4,0,0,0,0,0,0,0,4,0,0,0,1,0,0,0,1,0,0,0,14,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,14,0,0,0,4,0,0,0,4,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,14,0,0,0,1,0,0,0,15,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,1,0,0,0,14,0,0,0,1,0,0,0,15,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,5,0,0,0,4,0,0,0,2,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,8,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,
0,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,3,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,8,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,6,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,12,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,7,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,6,0,0,0,4,0,0,0,7,0,0,0,4,0,0,0,12,0,0,0,4,0,0,0,13,0,0,0,0,0,0,0,5,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,
0,0,0,7,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,4,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,4,0,0,0,2,0,0,0,4,0,0,0,1,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,3,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,4,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,1,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,0,0,0,0,13,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,
0,0,255,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,0,0,0,0,15,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,0,0,0,8,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,0,0,0,8,0,0,0,0,0,0,0,15,0,0,0,4,0,0,0,10,0,0,0,4,0,0,0,9,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,11,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,12,0,0,0,255,0,0,0,0,0,0,0,255,0,0,0,0,0,0,0,4,0,0,0,9,0,0,0,4,0,0,0,12,0,0,0,4,0,0,0,11,0,0,0,4,0,0,0,14,0,0,
0,0,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,5,6,7,8,9,10,12,13,15,17,20,22,25,28,32,36,40,45,50,56,63,71,80,90,101,113,127,144,162,182,203,226,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,3,3,3,3,4,4,4,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16,16,17,17,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,2,1,2,3,1,2,3,2,2,3,2,2,4,2,3,4,2,3,4,3,3,5,3,4,6,3,4,6,4,5,7,4,5,8,4,6,9,5,7,10,6,8,11,6,8,13,7,10,14,8,11,16,9,12,18,10,13,20,11,15,23,13,17,25,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,68,69,67,79,68,69,82,32,73,78,73,84,73,65,76,73,90,65,84,73,79,78,32,70,65,73,76,69,68,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"i8",Ba,z.Pc);var $a=z.ub(M(12,"i8",L),8);w(0==$a%8);
var U={O:1,Q:2,Ef:3,De:4,ha:5,Zb:6,be:7,$e:8,V:9,oe:10,Ca:11,Of:11,Mc:12,qb:13,ye:14,mf:15,ga:16,Xb:17,Oc:18,Qa:19,Sa:20,pa:21,B:22,Ve:23,Lc:24,Nc:25,Lf:26,ze:27,hf:28,Ua:29,Bf:30,Oe:31,uf:32,ve:33,yf:34,df:42,Be:43,pe:44,Fe:45,Ge:46,He:47,Ne:48,Mf:49,Ye:50,Ee:51,te:35,af:37,ge:52,je:53,Pf:54,We:55,ke:56,le:57,ue:35,me:59,kf:60,Ze:61,If:62,jf:63,ef:64,ff:65,Af:66,bf:67,ee:68,Ff:69,qe:70,vf:71,Qe:72,we:73,ie:74,qf:76,he:77,zf:78,Ie:79,Je:80,Me:81,Le:82,Ke:83,lf:38,sb:39,Re:36,rb:40,Ta:95,tf:96,se:104,
Xe:105,fe:97,xf:91,of:88,gf:92,Cf:108,Wb:111,ce:98,re:103,Ue:101,Se:100,Jf:110,Ae:112,Yb:113,Jc:115,Hc:114,Ic:89,Pe:90,wf:93,Df:94,de:99,Te:102,Kc:106,Ra:107,Kf:109,Nf:87,xe:122,Gf:116,pf:95,cf:123,Ce:84,rf:75,ne:125,nf:131,sf:130,Hf:86},ab={"0":"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",
12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",
34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",
53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",
74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",
90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",
107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"},bb=0;function V(a){return K[bb>>2]=a}
function cb(a,b){for(var c=0,e=a.length-1;0<=e;e--){var f=a[e];"."===f?a.splice(e,1):".."===f?(a.splice(e,1),c++):c&&(a.splice(e,1),c--)}if(b)for(;c--;c)a.unshift("..");return a}function db(a){var b="/"===a.charAt(0),c="/"===a.substr(-1),a=cb(a.split("/").filter(function(a){return!!a}),!b).join("/");!a&&!b&&(a=".");a&&c&&(a+="/");return(b?"/":"")+a}
function eb(a){var b=/^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1),a=b[0],b=b[1];if(!a&&!b)return".";b&&(b=b.substr(0,b.length-1));return a+b}function W(a){if("/"===a)return"/";var b=a.lastIndexOf("/");return-1===b?a:a.substr(b+1)}function fb(){var a=Array.prototype.slice.call(arguments,0);return db(a.join("/"))}function X(a,b){return db(a+"/"+b)}
function gb(){for(var a="",b=m,c=arguments.length-1;-1<=c&&!b;c--){b=0<=c?arguments[c]:B.yb();"string"!==typeof b&&d(new TypeError("Arguments to path.resolve must be strings"));if(!b)return"";a=b+"/"+a;b="/"===b.charAt(0)}a=cb(a.split("/").filter(function(a){return!!a}),!b).join("/");return(b?"/":"")+a||"."}
function hb(a,b){function c(a){for(var b=0;b<a.length&&""===a[b];b++);for(var c=a.length-1;0<=c&&""===a[c];c--);return b>c?[]:a.slice(b,c-b+1)}for(var a=gb(a).substr(1),b=gb(b).substr(1),e=c(a.split("/")),f=c(b.split("/")),h=Math.min(e.length,f.length),j=h,l=0;l<h;l++)if(e[l]!==f[l]){j=l;break}h=[];for(l=j;l<e.length;l++)h.push("..");h=h.concat(f.slice(j));return h.join("/")}var ib=[];function jb(a,b){ib[a]={input:[],K:[],sa:b};B.Ob(a,kb)}
var kb={open:function(a){var b=ib[a.g.ob];b||d(new B.e(U.Qa));a.N=b;a.seekable=m},close:function(a){a.N.sa.flush(a.N)},flush:function(a){a.N.sa.flush(a.N)},M:function(a,b,c,e){(!a.N||!a.N.sa.rc)&&d(new B.e(U.Zb));for(var f=0,h=0;h<e;h++){var j;try{j=a.N.sa.rc(a.N)}catch(l){d(new B.e(U.ha))}j===g&&0===f&&d(new B.e(U.Ca));if(j===k||j===g)break;f++;b[c+h]=j}f&&(a.g.timestamp=Date.now());return f},write:function(a,b,c,e){(!a.N||!a.N.sa.Lb)&&d(new B.e(U.Zb));for(var f=0;f<e;f++)try{a.N.sa.Lb(a.N,b[c+f])}catch(h){d(new B.e(U.ha))}e&&
(a.g.timestamp=Date.now());return f}},mb={rc:function(a){if(!a.input.length){var b=k;if(t){if(b=process.stdin.read(),!b){if(process.stdin._readableState&&process.stdin._readableState.ended)return k;return}}else"undefined"!=typeof window&&"function"==typeof window.prompt?(b=window.prompt("Input: "),b!==k&&(b+="\n")):"function"==typeof readline&&(b=readline(),b!==k&&(b+="\n"));if(!b)return k;a.input=Va(b,i)}return a.input.shift()},flush:function(a){a.K&&0<a.K.length&&(p.print(a.K.join("")),a.K=[])},
Lb:function(a,b){b===k||10===b?(p.print(a.K.join("")),a.K=[]):a.K.push(lb.nb(b))}},nb={Lb:function(a,b){b===k||10===b?(p.printErr(a.K.join("")),a.K=[]):a.K.push(lb.nb(b))},flush:function(a){a.K&&0<a.K.length&&(p.printErr(a.K.join("")),a.K=[])}},Y={U:k,F:function(){return Y.createNode(k,"/",16895,0)},createNode:function(a,b,c,e){(B.Bd(c)||B.Cd(c))&&d(new B.e(U.O));Y.U||(Y.U={dir:{g:{S:Y.n.S,I:Y.n.I,ra:Y.n.ra,ba:Y.n.ba,rename:Y.n.rename,za:Y.n.za,Oa:Y.n.Oa,Na:Y.n.Na,ca:Y.n.ca},A:{$:Y.p.$}},file:{g:{S:Y.n.S,
I:Y.n.I},A:{$:Y.p.$,M:Y.p.M,write:Y.p.write,Ea:Y.p.Ea,Ja:Y.p.Ja}},link:{g:{S:Y.n.S,I:Y.n.I,ta:Y.n.ta},A:{}},ec:{g:{S:Y.n.S,I:Y.n.I},A:B.bd}});c=B.createNode(a,b,c,e);B.J(c.mode)?(c.n=Y.U.dir.g,c.p=Y.U.dir.A,c.k={}):B.isFile(c.mode)?(c.n=Y.U.file.g,c.p=Y.U.file.A,c.q=0,c.k=k):B.Ia(c.mode)?(c.n=Y.U.link.g,c.p=Y.U.link.A):B.ib(c.mode)&&(c.n=Y.U.ec.g,c.p=Y.U.ec.A);c.timestamp=Date.now();a&&(a.k[b]=c);return c},ud:function(a){if(a.k&&a.k.subarray){for(var b=[],c=0;c<a.q;++c)b.push(a.k[c]);return b}return a.k},
qg:function(a){return!a.k?new Uint8Array:a.k.subarray?a.k.subarray(0,a.q):new Uint8Array(a.k)},lc:function(a,b){a.k&&(a.k.subarray&&b>a.k.length)&&(a.k=Y.ud(a),a.q=a.k.length);if(!a.k||a.k.subarray){var c=a.k?a.k.buffer.byteLength:0;c>=b||(b=Math.max(b,c*(1048576>c?2:1.125)|0),0!=c&&(b=Math.max(b,256)),c=a.k,a.k=new Uint8Array(b),0<a.q&&a.k.set(c.subarray(0,a.q),0))}else{!a.k&&0<b&&(a.k=[]);for(;a.k.length<b;)a.k.push(0)}},Ud:function(a,b){if(a.q!=b)if(0==b)a.k=k,a.q=0;else{if(!a.k||a.k.subarray){var c=
a.k;a.k=new Uint8Array(new ArrayBuffer(b));c&&a.k.set(c.subarray(0,Math.min(b,a.q)))}else if(a.k||(a.k=[]),a.k.length>b)a.k.length=b;else for(;a.k.length<b;)a.k.push(0);a.q=b}},n:{S:function(a){var b={};b.gg=B.ib(a.mode)?a.id:1;b.wg=a.id;b.mode=a.mode;b.Ig=1;b.uid=0;b.ug=0;b.ob=a.ob;b.size=B.J(a.mode)?4096:B.isFile(a.mode)?a.q:B.Ia(a.mode)?a.link.length:0;b.Zf=new Date(a.timestamp);b.Hg=new Date(a.timestamp);b.eg=new Date(a.timestamp);b.Zc=4096;b.$f=Math.ceil(b.size/b.Zc);return b},I:function(a,b){b.mode!==
g&&(a.mode=b.mode);b.timestamp!==g&&(a.timestamp=b.timestamp);b.size!==g&&Y.Ud(a,b.size)},ra:function(){d(B.Db[U.Q])},ba:function(a,b,c,e){return Y.createNode(a,b,c,e)},rename:function(a,b,c){if(B.J(a.mode)){var e;try{e=B.aa(b,c)}catch(f){}if(e)for(var h in e.k)d(new B.e(U.sb))}delete a.parent.k[a.name];a.name=c;b.k[c]=a;a.parent=b},za:function(a,b){delete a.k[b]},Oa:function(a,b){var c=B.aa(a,b),e;for(e in c.k)d(new B.e(U.sb));delete a.k[b]},Na:function(a){var b=[".",".."],c;for(c in a.k)a.k.hasOwnProperty(c)&&
b.push(c);return b},ca:function(a,b,c){a=Y.createNode(a,b,41471,0);a.link=c;return a},ta:function(a){B.Ia(a.mode)||d(new B.e(U.B));return a.link}},p:{M:function(a,b,c,e,f){var h=a.g.k;if(f>=a.g.q)return 0;a=Math.min(a.g.q-f,e);w(0<=a);if(8<a&&h.subarray)b.set(h.subarray(f,f+a),c);else for(e=0;e<a;e++)b[c+e]=h[f+e];return a},write:function(a,b,c,e,f,h){if(!e)return 0;a=a.g;a.timestamp=Date.now();if(b.subarray&&(!a.k||a.k.subarray)){if(h)return a.k=b.subarray(c,c+e),a.q=e;if(0===a.q&&0===f)return a.k=
new Uint8Array(b.subarray(c,c+e)),a.q=e;if(f+e<=a.q)return a.k.set(b.subarray(c,c+e),f),e}Y.lc(a,f+e);if(a.k.subarray&&b.subarray)a.k.set(b.subarray(c,c+e),f);else for(h=0;h<e;h++)a.k[f+h]=b[c+h];a.q=Math.max(a.q,f+e);return e},$:function(a,b,c){1===c?b+=a.position:2===c&&B.isFile(a.g.mode)&&(b+=a.g.q);0>b&&d(new B.e(U.B));return b},Ea:function(a,b,c){Y.lc(a.g,b+c);a.g.q=Math.max(a.g.q,b+c)},Ja:function(a,b,c,e,f,h,j){B.isFile(a.g.mode)||d(new B.e(U.Qa));c=a.g.k;if(!(j&2)&&(c.buffer===b||c.buffer===
b.buffer))a=m,e=c.byteOffset;else{if(0<f||f+e<a.g.q)c=c.subarray?c.subarray(f,f+e):Array.prototype.slice.call(c,f,f+e);a=i;(e=Ca(e))||d(new B.e(U.Mc));b.set(c,e)}return{Lg:e,Yf:a}}}},ob=M(1,"i32*",L),pb=M(1,"i32*",L),qb=M(1,"i32*",L),B={root:k,La:[],ic:[k],oa:[],Jd:1,T:k,hc:"/",hb:m,vc:i,H:{},Gc:{yc:{Rc:1,Sc:2}},e:k,Db:{},sc:function(a){a instanceof B.e||d(a+" : "+Fa());return V(a.cb)},u:function(a,b){a=gb(B.yb(),a);b=b||{};if(!a)return{path:"",g:k};var c={Bb:i,Nb:0},e;for(e in c)b[e]===g&&(b[e]=
c[e]);8<b.Nb&&d(new B.e(U.rb));var c=cb(a.split("/").filter(function(a){return!!a}),m),f=B.root;e="/";for(var h=0;h<c.length;h++){var j=h===c.length-1;if(j&&b.parent)break;f=B.aa(f,c[h]);e=X(e,c[h]);if(B.ka(f)&&(!j||j&&b.Bb))f=f.Ka.root;if(!j||b.R)for(j=0;B.Ia(f.mode);)f=B.ta(e),e=gb(eb(e),f),f=B.u(e,{Nb:b.Nb}).g,40<j++&&d(new B.e(U.rb))}return{path:e,g:f}},da:function(a){for(var b;;){if(B.jb(a))return a=a.F.Id,!b?a:"/"!==a[a.length-1]?a+"/"+b:a+b;b=b?a.name+"/"+b:a.name;a=a.parent}},Fb:function(a,
b){for(var c=0,e=0;e<b.length;e++)c=(c<<5)-c+b.charCodeAt(e)|0;return(a+c>>>0)%B.T.length},tc:function(a){var b=B.Fb(a.parent.id,a.name);a.ma=B.T[b];B.T[b]=a},uc:function(a){var b=B.Fb(a.parent.id,a.name);if(B.T[b]===a)B.T[b]=a.ma;else for(b=B.T[b];b;){if(b.ma===a){b.ma=a.ma;break}b=b.ma}},aa:function(a,b){var c=B.Gd(a);c&&d(new B.e(c,a));for(c=B.T[B.Fb(a.id,b)];c;c=c.ma){var e=c.name;if(c.parent.id===a.id&&e===b)return c}return B.ra(a,b)},createNode:function(a,b,c,e){B.Va||(B.Va=function(a,b,c,e){a||
(a=this);this.parent=a;this.F=a.F;this.Ka=k;this.id=B.Jd++;this.name=b;this.mode=c;this.n={};this.p={};this.ob=e},B.Va.prototype={},Object.defineProperties(B.Va.prototype,{M:{get:function(){return 365===(this.mode&365)},set:function(a){a?this.mode|=365:this.mode&=-366}},write:{get:function(){return 146===(this.mode&146)},set:function(a){a?this.mode|=146:this.mode&=-147}},Dd:{get:function(){return B.J(this.mode)}},Gb:{get:function(){return B.ib(this.mode)}}}));a=new B.Va(a,b,c,e);B.tc(a);return a},
zb:function(a){B.uc(a)},jb:function(a){return a===a.parent},ka:function(a){return!!a.Ka},isFile:function(a){return 32768===(a&61440)},J:function(a){return 16384===(a&61440)},Ia:function(a){return 40960===(a&61440)},ib:function(a){return 8192===(a&61440)},Bd:function(a){return 24576===(a&61440)},Cd:function(a){return 4096===(a&61440)},Ed:function(a){return 49152===(a&49152)},rd:{r:0,rs:1052672,"r+":2,w:577,wx:705,xw:705,"w+":578,"wx+":706,"xw+":706,a:1089,ax:1217,xa:1217,"a+":1090,"ax+":1218,"xa+":1218},
wc:function(a){var b=B.rd[a];"undefined"===typeof b&&d(Error("Unknown file open mode: "+a));return b},sd:function(a){var b=["r","w","rw"][a&2097155];a&512&&(b+="w");return b},na:function(a,b){return B.vc?0:-1!==b.indexOf("r")&&!(a.mode&292)||-1!==b.indexOf("w")&&!(a.mode&146)||-1!==b.indexOf("x")&&!(a.mode&73)?U.qb:0},Gd:function(a){var b=B.na(a,"x");return b?b:!a.n.ra?U.qb:0},Jb:function(a,b){try{return B.aa(a,b),U.Xb}catch(c){}return B.na(a,"wx")},kb:function(a,b,c){var e;try{e=B.aa(a,b)}catch(f){return f.cb}if(a=
B.na(a,"wx"))return a;if(c){if(!B.J(e.mode))return U.Sa;if(B.jb(e)||B.da(e)===B.yb())return U.ga}else if(B.J(e.mode))return U.pa;return 0},Hd:function(a,b){return!a?U.Q:B.Ia(a.mode)?U.rb:B.J(a.mode)&&(0!==(b&2097155)||b&512)?U.pa:B.na(a,B.sd(b))},Qc:4096,Kd:function(a,b){for(var b=b||B.Qc,c=a||0;c<=b;c++)if(!B.oa[c])return c;d(new B.e(U.Lc))},qa:function(a){return B.oa[a]},fc:function(a,b,c){B.Wa||(B.Wa=n(),B.Wa.prototype={},Object.defineProperties(B.Wa.prototype,{object:{get:function(){return this.g},
set:function(a){this.g=a}},yg:{get:function(){return 1!==(this.D&2097155)}},zg:{get:function(){return 0!==(this.D&2097155)}},xg:{get:function(){return this.D&1024}}}));var e=new B.Wa,f;for(f in a)e[f]=a[f];a=e;b=B.Kd(b,c);a.C=b;return B.oa[b]=a},dd:function(a){B.oa[a]=k},pc:function(a){return B.oa[a-1]},Eb:function(a){return a?a.C+1:0},bd:{open:function(a){a.p=B.td(a.g.ob).p;a.p.open&&a.p.open(a)},$:function(){d(new B.e(U.Ua))}},Ib:function(a){return a>>8},Gg:function(a){return a&255},la:function(a,
b){return a<<8|b},Ob:function(a,b){B.ic[a]={p:b}},td:function(a){return B.ic[a]},nc:function(a){for(var b=[],a=[a];a.length;){var c=a.pop();b.push(c);a.push.apply(a,c.La)}return b},Fc:function(a,b){function c(a){if(a){if(!c.pd)return c.pd=i,b(a)}else++f>=e.length&&b(k)}"function"===typeof a&&(b=a,a=m);var e=B.nc(B.root.F),f=0;e.forEach(function(b){if(!b.type.Fc)return c(k);b.type.Fc(b,a,c)})},F:function(a,b,c){var e="/"===c,f=!c,h;e&&B.root&&d(new B.e(U.ga));!e&&!f&&(h=B.u(c,{Bb:m}),c=h.path,h=h.g,
B.ka(h)&&d(new B.e(U.ga)),B.J(h.mode)||d(new B.e(U.Sa)));b={type:a,Kg:b,Id:c,La:[]};a=a.F(b);a.F=b;b.root=a;e?B.root=a:h&&(h.Ka=b,h.F&&h.F.La.push(b));return a},Qg:function(a){a=B.u(a,{Bb:m});B.ka(a.g)||d(new B.e(U.B));var a=a.g,b=a.Ka,c=B.nc(b);Object.keys(B.T).forEach(function(a){for(a=B.T[a];a;){var b=a.ma;-1!==c.indexOf(a.F)&&B.zb(a);a=b}});a.Ka=k;b=a.F.La.indexOf(b);w(-1!==b);a.F.La.splice(b,1)},ra:function(a,b){return a.n.ra(a,b)},ba:function(a,b,c){var e=B.u(a,{parent:i}).g,a=W(a);(!a||"."===
a||".."===a)&&d(new B.e(U.B));var f=B.Jb(e,a);f&&d(new B.e(f));e.n.ba||d(new B.e(U.O));return e.n.ba(e,a,b,c)},create:function(a,b){b=(b!==g?b:438)&4095;b|=32768;return B.ba(a,b,0)},ea:function(a,b){b=(b!==g?b:511)&1023;b|=16384;return B.ba(a,b,0)},lb:function(a,b,c){"undefined"===typeof c&&(c=b,b=438);return B.ba(a,b|8192,c)},ca:function(a,b){gb(a)||d(new B.e(U.Q));var c=B.u(b,{parent:i}).g;c||d(new B.e(U.Q));var e=W(b),f=B.Jb(c,e);f&&d(new B.e(f));c.n.ca||d(new B.e(U.O));return c.n.ca(c,e,a)},rename:function(a,
b){var c=eb(a),e=eb(b),f=W(a),h=W(b),j,l,u;try{j=B.u(a,{parent:i}),l=j.g,j=B.u(b,{parent:i}),u=j.g}catch(q){d(new B.e(U.ga))}(!l||!u)&&d(new B.e(U.Q));l.F!==u.F&&d(new B.e(U.Oc));j=B.aa(l,f);e=hb(a,e);"."!==e.charAt(0)&&d(new B.e(U.B));e=hb(b,c);"."!==e.charAt(0)&&d(new B.e(U.sb));var x;try{x=B.aa(u,h)}catch(s){}if(j!==x){c=B.J(j.mode);(f=B.kb(l,f,c))&&d(new B.e(f));(f=x?B.kb(u,h,c):B.Jb(u,h))&&d(new B.e(f));l.n.rename||d(new B.e(U.O));(B.ka(j)||x&&B.ka(x))&&d(new B.e(U.ga));u!==l&&(f=B.na(l,"w"))&&
d(new B.e(f));try{B.H.willMovePath&&B.H.willMovePath(a,b)}catch(v){console.log("FS.trackingDelegate['willMovePath']('"+a+"', '"+b+"') threw an exception: "+v.message)}B.uc(j);try{l.n.rename(j,u,h)}catch(G){d(G)}finally{B.tc(j)}try{if(B.H.onMovePath)B.H.onMovePath(a,b)}catch(ua){console.log("FS.trackingDelegate['onMovePath']('"+a+"', '"+b+"') threw an exception: "+ua.message)}}},Oa:function(a){var b=B.u(a,{parent:i}).g,c=W(a),e=B.aa(b,c),f=B.kb(b,c,i);f&&d(new B.e(f));b.n.Oa||d(new B.e(U.O));B.ka(e)&&
d(new B.e(U.ga));try{B.H.willDeletePath&&B.H.willDeletePath(a)}catch(h){console.log("FS.trackingDelegate['willDeletePath']('"+a+"') threw an exception: "+h.message)}b.n.Oa(b,c);B.zb(e);try{if(B.H.onDeletePath)B.H.onDeletePath(a)}catch(j){console.log("FS.trackingDelegate['onDeletePath']('"+a+"') threw an exception: "+j.message)}},Na:function(a){a=B.u(a,{R:i}).g;a.n.Na||d(new B.e(U.Sa));return a.n.Na(a)},za:function(a){var b=B.u(a,{parent:i}).g,c=W(a),e=B.aa(b,c),f=B.kb(b,c,m);f&&(f===U.pa&&(f=U.O),
d(new B.e(f)));b.n.za||d(new B.e(U.O));B.ka(e)&&d(new B.e(U.ga));try{B.H.willDeletePath&&B.H.willDeletePath(a)}catch(h){console.log("FS.trackingDelegate['willDeletePath']('"+a+"') threw an exception: "+h.message)}b.n.za(b,c);B.zb(e);try{if(B.H.onDeletePath)B.H.onDeletePath(a)}catch(j){console.log("FS.trackingDelegate['onDeletePath']('"+a+"') threw an exception: "+j.message)}},ta:function(a){(a=B.u(a).g)||d(new B.e(U.Q));a.n.ta||d(new B.e(U.B));return a.n.ta(a)},Dc:function(a,b){var c=B.u(a,{R:!b}).g;
c||d(new B.e(U.Q));c.n.S||d(new B.e(U.O));return c.n.S(c)},Eg:function(a){return B.Dc(a,i)},Ya:function(a,b,c){a="string"===typeof a?B.u(a,{R:!c}).g:a;a.n.I||d(new B.e(U.O));a.n.I(a,{mode:b&4095|a.mode&-4096,timestamp:Date.now()})},Bg:function(a,b){B.Ya(a,b,i)},jg:function(a,b){var c=B.qa(a);c||d(new B.e(U.V));B.Ya(c.g,b)},dc:function(a,b,c,e){a="string"===typeof a?B.u(a,{R:!e}).g:a;a.n.I||d(new B.e(U.O));a.n.I(a,{timestamp:Date.now()})},Cg:function(a,b,c){B.dc(a,b,c,i)},kg:function(a,b,c){(a=B.qa(a))||
d(new B.e(U.V));B.dc(a.g,b,c)},truncate:function(a,b){0>b&&d(new B.e(U.B));var c;c="string"===typeof a?B.u(a,{R:i}).g:a;c.n.I||d(new B.e(U.O));B.J(c.mode)&&d(new B.e(U.pa));B.isFile(c.mode)||d(new B.e(U.B));var e=B.na(c,"w");e&&d(new B.e(e));c.n.I(c,{size:b,timestamp:Date.now()})},mg:function(a,b){var c=B.qa(a);c||d(new B.e(U.V));0===(c.D&2097155)&&d(new B.e(U.B));B.truncate(c.g,b)},Rg:function(a,b,c){a=B.u(a,{R:i}).g;a.n.I(a,{timestamp:Math.max(b,c)})},open:function(a,b,c,e,f){""===a&&d(new B.e(U.Q));
var b="string"===typeof b?B.wc(b):b,c=b&64?("undefined"===typeof c?438:c)&4095|32768:0,h;if("object"===typeof a)h=a;else{a=db(a);try{h=B.u(a,{R:!(b&131072)}).g}catch(j){}}var l=m;b&64&&(h?b&128&&d(new B.e(U.Xb)):(h=B.ba(a,c,0),l=i));h||d(new B.e(U.Q));B.ib(h.mode)&&(b&=-513);l||(c=B.Hd(h,b))&&d(new B.e(c));b&512&&B.truncate(h,0);b&=-641;e=B.fc({g:h,path:B.da(h),D:b,seekable:i,position:0,p:h.p,$d:[],error:m},e,f);e.p.open&&e.p.open(e);p.logReadFiles&&!(b&1)&&(B.Mb||(B.Mb={}),a in B.Mb||(B.Mb[a]=1,
p.printErr("read file: "+a)));try{B.H.onOpenFile&&(f=0,1!==(b&2097155)&&(f|=B.Gc.yc.Rc),0!==(b&2097155)&&(f|=B.Gc.yc.Sc),B.H.onOpenFile(a,f))}catch(u){console.log("FS.trackingDelegate['onOpenFile']('"+a+"', flags) threw an exception: "+u.message)}return e},close:function(a){try{a.p.close&&a.p.close(a)}catch(b){d(b)}finally{B.dd(a.C)}},$:function(a,b,c){(!a.seekable||!a.p.$)&&d(new B.e(U.Ua));a.position=a.p.$(a,b,c);a.$d=[];return a.position},M:function(a,b,c,e,f){(0>e||0>f)&&d(new B.e(U.B));1===(a.D&
2097155)&&d(new B.e(U.V));B.J(a.g.mode)&&d(new B.e(U.pa));a.p.M||d(new B.e(U.B));var h=i;"undefined"===typeof f?(f=a.position,h=m):a.seekable||d(new B.e(U.Ua));b=a.p.M(a,b,c,e,f);h||(a.position+=b);return b},write:function(a,b,c,e,f,h){(0>e||0>f)&&d(new B.e(U.B));0===(a.D&2097155)&&d(new B.e(U.V));B.J(a.g.mode)&&d(new B.e(U.pa));a.p.write||d(new B.e(U.B));a.D&1024&&B.$(a,0,2);var j=i;"undefined"===typeof f?(f=a.position,j=m):a.seekable||d(new B.e(U.Ua));b=a.p.write(a,b,c,e,f,h);j||(a.position+=b);
try{if(a.path&&B.H.onWriteToFile)B.H.onWriteToFile(a.path)}catch(l){console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: "+l.message)}return b},Ea:function(a,b,c){(0>b||0>=c)&&d(new B.e(U.B));0===(a.D&2097155)&&d(new B.e(U.V));!B.isFile(a.g.mode)&&!B.J(node.mode)&&d(new B.e(U.Qa));a.p.Ea||d(new B.e(U.Ta));a.p.Ea(a,b,c)},Ja:function(a,b,c,e,f,h,j){1===(a.D&2097155)&&d(new B.e(U.qb));a.p.Ja||d(new B.e(U.Qa));return a.p.Ja(a,b,c,e,f,h,j)},Ha:function(a,b,c){a.p.Ha||d(new B.e(U.Nc));
return a.p.Ha(a,b,c)},Mg:function(a,b){b=b||{};b.D=b.D||"r";b.encoding=b.encoding||"binary";"utf8"!==b.encoding&&"binary"!==b.encoding&&d(Error('Invalid encoding type "'+b.encoding+'"'));var c,e=B.open(a,b.D),f=B.Dc(a).size,h=new Uint8Array(f);B.M(e,h,0,f,0);if("utf8"===b.encoding){c="";for(var j=new z.Da,l=0;l<f;l++)c+=j.nb(h[l])}else"binary"===b.encoding&&(c=h);B.close(e);return c},Sg:function(a,b,c){c=c||{};c.D=c.D||"w";c.encoding=c.encoding||"utf8";"utf8"!==c.encoding&&"binary"!==c.encoding&&
d(Error('Invalid encoding type "'+c.encoding+'"'));a=B.open(a,c.D,c.mode);"utf8"===c.encoding?(b=new Uint8Array((new z.Da).Ac(b)),B.write(a,b,0,b.length,0,c.ad)):"binary"===c.encoding&&B.write(a,b,0,b.length,0,c.ad);B.close(a)},yb:function(){return B.hc},bg:function(a){a=B.u(a,{R:i});B.J(a.g.mode)||d(new B.e(U.Sa));var b=B.na(a.g,"x");b&&d(new B.e(b));B.hc=a.path},fd:function(){B.ea("/tmp");B.ea("/home");B.ea("/home/web_user")},ed:function(){B.ea("/dev");B.Ob(B.la(1,3),{M:function(){return 0},write:function(){return 0}});
B.lb("/dev/null",B.la(1,3));jb(B.la(5,0),mb);jb(B.la(6,0),nb);B.lb("/dev/tty",B.la(5,0));B.lb("/dev/tty1",B.la(6,0));var a;if("undefined"!==typeof crypto){var b=new Uint8Array(1);a=function(){crypto.getRandomValues(b);return b[0]}}else a=t?function(){return (null)("crypto").randomBytes(1)[0]}:function(){return 256*Math.random()|0};B.X("/dev","random",a);B.X("/dev","urandom",a);B.ea("/dev/shm");B.ea("/dev/shm/tmp")},od:function(){p.stdin?B.X("/dev","stdin",p.stdin):B.ca("/dev/tty","/dev/stdin");p.stdout?
B.X("/dev","stdout",k,p.stdout):B.ca("/dev/tty","/dev/stdout");p.stderr?B.X("/dev","stderr",k,p.stderr):B.ca("/dev/tty1","/dev/stderr");var a=B.open("/dev/stdin","r");K[ob>>2]=B.Eb(a);w(0===a.C,"invalid handle for stdin ("+a.C+")");a=B.open("/dev/stdout","w");K[pb>>2]=B.Eb(a);w(1===a.C,"invalid handle for stdout ("+a.C+")");a=B.open("/dev/stderr","w");K[qb>>2]=B.Eb(a);w(2===a.C,"invalid handle for stderr ("+a.C+")")},jc:function(){B.e||(B.e=function(a,b){this.g=b;this.Xd=function(a){this.cb=a;for(var b in U)if(U[b]===
a){this.code=b;break}};this.Xd(a);this.message=ab[a]},B.e.prototype=Error(),[U.Q].forEach(function(a){B.Db[a]=new B.e(a);B.Db[a].stack="<generic error, no stack>"}))},Zd:function(){B.jc();B.T=Array(4096);B.F(Y,{},"/");B.fd();B.ed()},Ga:function(a,b,c){w(!B.Ga.hb,"FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");B.Ga.hb=i;B.jc();p.stdin=a||p.stdin;p.stdout=b||p.stdout;p.stderr=
c||p.stderr;B.od()},Qd:function(){B.Ga.hb=m;for(var a=0;a<B.oa.length;a++){var b=B.oa[a];b&&B.close(b)}},fb:function(a,b){var c=0;a&&(c|=365);b&&(c|=146);return c},Ag:function(a,b){var c=fb.apply(k,a);b&&"/"==c[0]&&(c=c.substr(1));return c},Sf:function(a,b){return gb(b,a)},Pg:function(a){return db(a)},lg:function(a,b){var c=B.vb(a,b);if(c.Ab)return c.object;V(c.error);return k},vb:function(a,b){try{var c=B.u(a,{R:!b}),a=c.path}catch(e){}var f={jb:m,Ab:m,error:0,name:k,path:k,object:k,Md:m,Od:k,Nd:k};
try{c=B.u(a,{parent:i}),f.Md=i,f.Od=c.path,f.Nd=c.g,f.name=W(a),c=B.u(a,{R:!b}),f.Ab=i,f.path=c.path,f.object=c.g,f.name=c.g.name,f.jb="/"===c.path}catch(h){f.error=h.cb}return f},hd:function(a,b,c,e){a=X("string"===typeof a?a:B.da(a),b);return B.ea(a,B.fb(c,e))},ld:function(a,b){for(var a="string"===typeof a?a:B.da(a),c=b.split("/").reverse();c.length;){var e=c.pop();if(e){var f=X(a,e);try{B.ea(f)}catch(h){}a=f}}return f},gd:function(a,b,c,e,f){a=X("string"===typeof a?a:B.da(a),b);return B.create(a,
B.fb(e,f))},xb:function(a,b,c,e,f,h){a=b?X("string"===typeof a?a:B.da(a),b):a;e=B.fb(e,f);f=B.create(a,e);if(c){if("string"===typeof c){for(var a=Array(c.length),b=0,j=c.length;b<j;++b)a[b]=c.charCodeAt(b);c=a}B.Ya(f,e|146);a=B.open(f,"w");B.write(a,c,0,c.length,0,h);B.close(a);B.Ya(f,e)}return f},X:function(a,b,c,e){a=X("string"===typeof a?a:B.da(a),b);b=B.fb(!!c,!!e);B.X.Ib||(B.X.Ib=64);var f=B.la(B.X.Ib++,0);B.Ob(f,{open:function(a){a.seekable=m},close:function(){e&&(e.buffer&&e.buffer.length)&&
e(10)},M:function(a,b,e,f){for(var q=0,x=0;x<f;x++){var s;try{s=c()}catch(v){d(new B.e(U.ha))}s===g&&0===q&&d(new B.e(U.Ca));if(s===k||s===g)break;q++;b[e+x]=s}q&&(a.g.timestamp=Date.now());return q},write:function(a,b,c,f){for(var q=0;q<f;q++)try{e(b[c+q])}catch(x){d(new B.e(U.ha))}f&&(a.g.timestamp=Date.now());return q}});return B.lb(a,b,f)},kd:function(a,b,c){a=X("string"===typeof a?a:B.da(a),b);return B.ca(c,a)},mc:function(a){if(a.Gb||a.Dd||a.link||a.k)return i;var b=i;"undefined"!==typeof XMLHttpRequest&&
d(Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread."));if(p.read)try{a.k=Va(p.read(a.url),i),a.q=a.k.length}catch(c){b=m}else d(Error("Cannot load without read() or XMLHttpRequest."));b||V(U.ha);return b},jd:function(a,b,c,e,f){function h(){this.Hb=m;this.Za=[]}h.prototype.get=function(a){if(!(a>this.length-1||0>a)){var b=a%this.cd;return this.yd(a/
this.cd|0)[b]}};h.prototype.Wd=function(a){this.yd=a};h.prototype.bc=function(){var a=new XMLHttpRequest;a.open("HEAD",c,m);a.send(k);200<=a.status&&300>a.status||304===a.status||d(Error("Couldn't load "+c+". Status: "+a.status));var b=Number(a.getResponseHeader("Content-length")),e,f=1048576;if(!((e=a.getResponseHeader("Accept-Ranges"))&&"bytes"===e))f=b;var h=this;h.Wd(function(a){var e=a*f,j=(a+1)*f-1,j=Math.min(j,b-1);if("undefined"===typeof h.Za[a]){var l=h.Za;e>j&&d(Error("invalid range ("+
e+", "+j+") or no bytes requested!"));j>b-1&&d(Error("only "+b+" bytes available! programmer error!"));var q=new XMLHttpRequest;q.open("GET",c,m);b!==f&&q.setRequestHeader("Range","bytes="+e+"-"+j);"undefined"!=typeof Uint8Array&&(q.responseType="arraybuffer");q.overrideMimeType&&q.overrideMimeType("text/plain; charset=x-user-defined");q.send(k);200<=q.status&&300>q.status||304===q.status||d(Error("Couldn't load "+c+". Status: "+q.status));e=q.response!==g?new Uint8Array(q.response||[]):Va(q.responseText||
"",i);l[a]=e}"undefined"===typeof h.Za[a]&&d(Error("doXHR failed!"));return h.Za[a]});this.Uc=b;this.Tc=f;this.Hb=i};if("undefined"!==typeof XMLHttpRequest){ca||d("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var j=new h;Object.defineProperty(j,"length",{get:function(){this.Hb||this.bc();return this.Uc}});Object.defineProperty(j,"chunkSize",{get:function(){this.Hb||this.bc();return this.Tc}});j={Gb:m,k:j}}else j={Gb:m,url:c};
var l=B.gd(a,b,j,e,f);j.k?l.k=j.k:j.url&&(l.k=k,l.url=j.url);Object.defineProperty(l,"usedBytes",{get:function(){return this.k.length}});var u={};Object.keys(l.p).forEach(function(a){var b=l.p[a];u[a]=function(){B.mc(l)||d(new B.e(U.ha));return b.apply(k,arguments)}});u.M=function(a,b,c,e,f){B.mc(l)||d(new B.e(U.ha));a=a.g.k;if(f>=a.length)return 0;e=Math.min(a.length-f,e);w(0<=e);if(a.slice)for(var h=0;h<e;h++)b[c+h]=a[f+h];else for(h=0;h<e;h++)b[c+h]=a.get(f+h);return e};l.p=u;return l},md:function(a,
b,c,e,f,h,j,l,u){function q(){rb=document.pointerLockElement===v||document.mozPointerLockElement===v||document.webkitPointerLockElement===v||document.msPointerLockElement===v}function x(c){function q(c){l||B.xb(a,b,c,e,f,u);h&&h();Za()}var s=m;p.preloadPlugins.forEach(function(a){!s&&a.canHandle(G)&&(a.handle(c,G,q,function(){j&&j();Za()}),s=i)});s||q(c)}p.preloadPlugins||(p.preloadPlugins=[]);if(!tb){tb=i;try{new Blob,ub=i}catch(s){ub=m,console.log("warning: no blob constructor, cannot create blobs with mimetypes")}vb=
"undefined"!=typeof MozBlobBuilder?MozBlobBuilder:"undefined"!=typeof WebKitBlobBuilder?WebKitBlobBuilder:!ub?console.log("warning: no BlobBuilder"):k;wb="undefined"!=typeof window?window.URL?window.URL:window.webkitURL:g;!p.xc&&"undefined"===typeof wb&&(console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available."),p.xc=i);p.preloadPlugins.push({canHandle:function(a){return!p.xc&&/\.(jpg|jpeg|png|bmp)$/i.test(a)},handle:function(a,b,
c,e){var f=k;if(ub)try{f=new Blob([a],{type:xb(b)}),f.size!==a.length&&(f=new Blob([(new Uint8Array(a)).buffer],{type:xb(b)}))}catch(h){z.Aa("Blob constructor present but fails: "+h+"; falling back to blob builder")}f||(f=new vb,f.append((new Uint8Array(a)).buffer),f=f.getBlob());var j=wb.createObjectURL(f),l=new Image;l.onload=function(){w(l.complete,"Image "+b+" could not be decoded");var e=document.createElement("canvas");e.width=l.width;e.height=l.height;e.getContext("2d").drawImage(l,0,0);p.preloadedImages[b]=
e;wb.revokeObjectURL(j);c&&c(a)};l.onerror=function(){console.log("Image "+j+" could not be decoded");e&&e()};l.src=j}});p.preloadPlugins.push({canHandle:function(a){return!p.Jg&&a.substr(-4)in{".ogg":1,".wav":1,".mp3":1}},handle:function(a,b,c,e){function f(e){j||(j=i,p.preloadedAudios[b]=e,c&&c(a))}function h(){j||(j=i,p.preloadedAudios[b]=new Audio,e&&e())}var j=m;if(ub){try{var l=new Blob([a],{type:xb(b)})}catch(q){return h()}var l=wb.createObjectURL(l),s=new Audio;s.addEventListener("canplaythrough",
function(){f(s)},m);s.onerror=function(){if(!j){console.log("warning: browser could not fully decode audio "+b+", trying slower base64 approach");for(var c="",e=0,h=0,l=0;l<a.length;l++){e=e<<8|a[l];for(h+=8;6<=h;)var q=e>>h-6&63,h=h-6,c=c+"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[q]}2==h?(c+="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[(e&3)<<4],c+="=="):4==h&&(c+="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[(e&15)<<2],c+="=");
s.src="data:audio/x-"+b.substr(-3)+";base64,"+c;f(s)}};s.src=l;p.noExitRuntime=i;setTimeout(function(){H||f(s)},1E4)}else return h()}});var v=p.canvas;v&&(v.Pb=v.requestPointerLock||v.mozRequestPointerLock||v.webkitRequestPointerLock||v.msRequestPointerLock||n(),v.kc=document.exitPointerLock||document.mozExitPointerLock||document.webkitExitPointerLock||document.msExitPointerLock||n(),v.kc=v.kc.bind(document),document.addEventListener("pointerlockchange",q,m),document.addEventListener("mozpointerlockchange",
q,m),document.addEventListener("webkitpointerlockchange",q,m),document.addEventListener("mspointerlockchange",q,m),p.elementPointerLock&&v.addEventListener("click",function(a){!rb&&v.Pb&&(v.Pb(),a.preventDefault())},m))}var G=b?gb(X(a,b)):a;Ya();"string"==typeof c?yb(c,function(a){x(a)},j):x(c)},indexedDB:function(){return window.indexedDB||window.mozIndexedDB||window.webkitIndexedDB||window.msIndexedDB},Ub:function(){return"EM_FS_"+window.location.pathname},Vb:20,Ba:"FILE_DATA",Og:function(a,b,c){var b=
b||n(),c=c||n(),e=B.indexedDB();try{var f=e.open(B.Ub(),B.Vb)}catch(h){return c(h)}f.Ld=function(){console.log("creating db");f.result.createObjectStore(B.Ba)};f.onsuccess=function(){var e=f.result.transaction([B.Ba],"readwrite"),h=e.objectStore(B.Ba),u=0,q=0,x=a.length;a.forEach(function(a){a=h.put(B.vb(a).object.k,a);a.onsuccess=function(){u++;u+q==x&&(0==q?b():c())};a.onerror=function(){q++;u+q==x&&(0==q?b():c())}});e.onerror=c};f.onerror=c},Dg:function(a,b,c){var b=b||n(),c=c||n(),e=B.indexedDB();
try{var f=e.open(B.Ub(),B.Vb)}catch(h){return c(h)}f.Ld=c;f.onsuccess=function(){var e=f.result;try{var h=e.transaction([B.Ba],"readonly")}catch(u){c(u);return}var q=h.objectStore(B.Ba),x=0,s=0,v=a.length;a.forEach(function(a){var e=q.get(a);e.onsuccess=function(){B.vb(a).Ab&&B.za(a);B.xb(eb(a),W(a),e.result,i,i,i);x++;x+s==v&&(0==s?b():c())};e.onerror=function(){s++;x+s==v&&(0==s?b():c())}});h.onerror=c};f.onerror=c}};function zb(){d("TODO")}
var Z={F:function(){p.websocket=p.websocket&&"object"===typeof p.websocket?p.websocket:{};p.websocket.tb={};p.websocket.on=function(a,b){"function"===typeof b&&(this.tb[a]=b);return this};p.websocket.P=function(a,b){"function"===typeof this.tb[a]&&this.tb[a].call(this,b)};return B.createNode(k,"/",16895,0)},nd:function(a,b,c){c&&w(1==b==(6==c));a={qd:a,type:b,protocol:c,G:k,error:k,Ma:{},Kb:[],ua:[],wa:Z.L};b=Z.mb();c=B.createNode(Z.root,b,49152,0);c.va=a;b=B.fc({path:b,g:c,D:B.wc("r+"),seekable:m,
p:Z.p});a.A=b;return a},wd:function(a){a=B.qa(a);return!a||!B.Ed(a.g.mode)?k:a.g.va},p:{zc:function(a){a=a.g.va;return a.wa.zc(a)},Ha:function(a,b,c){a=a.g.va;return a.wa.Ha(a,b,c)},M:function(a,b,c,e){a=a.g.va;e=a.wa.Rd(a,e);if(!e)return 0;b.set(e.buffer,c);return e.buffer.length},write:function(a,b,c,e){a=a.g.va;return a.wa.Vd(a,b,c,e)},close:function(a){a=a.g.va;a.wa.close(a)}},mb:function(){Z.mb.gc||(Z.mb.gc=0);return"socket["+Z.mb.gc++ +"]"},L:{$a:function(a,b,c){var e;"object"===typeof b&&(e=
b,c=b=k);if(e)e._socket?(b=e._socket.remoteAddress,c=e._socket.remotePort):((c=/ws[s]?:\/\/([^:]+):(\d+)/.exec(e.url))||d(Error("WebSocket URL must be in the format ws(s)://address:port")),b=c[1],c=parseInt(c[2],10));else try{var f=p.websocket&&"object"===typeof p.websocket,h="ws:#".replace("#","//");f&&"string"===typeof p.websocket.url&&(h=p.websocket.url);if("ws://"===h||"wss://"===h)var j=b.split("/"),h=h+j[0]+":"+c+"/"+j.slice(1).join("/");j="binary";f&&"string"===typeof p.websocket.subprotocol&&
(j=p.websocket.subprotocol);var j=j.replace(/^ +| +$/g,"").split(/ *, */),l=t?{protocol:j.toString()}:j;e=new (t?(null)("ws"):window.WebSocket)(h,l);e.binaryType="arraybuffer"}catch(u){d(new B.e(U.Yb))}b={W:b,port:c,o:e,ab:[]};Z.L.$b(a,b);Z.L.zd(a,b);2===a.type&&"undefined"!==typeof a.ya&&b.ab.push(new Uint8Array([255,255,255,255,112,111,114,116,(a.ya&65280)>>8,a.ya&255]));return b},gb:function(a,b,c){return a.Ma[b+":"+c]},$b:function(a,b){a.Ma[b.W+":"+b.port]=b},Bc:function(a,b){delete a.Ma[b.W+
":"+b.port]},zd:function(a,b){function c(){p.websocket.P("open",a.A.C);try{for(var c=b.ab.shift();c;)b.o.send(c),c=b.ab.shift()}catch(e){b.o.close()}}function e(c){w("string"!==typeof c&&c.byteLength!==g);var c=new Uint8Array(c),e=f;f=m;e&&10===c.length&&255===c[0]&&255===c[1]&&255===c[2]&&255===c[3]&&112===c[4]&&111===c[5]&&114===c[6]&&116===c[7]?(c=c[8]<<8|c[9],Z.L.Bc(a,b),b.port=c,Z.L.$b(a,b)):(a.ua.push({W:b.W,port:b.port,data:c}),p.websocket.P("message",a.A.C))}var f=i;t?(b.o.on("open",c),b.o.on("message",
function(a,b){b.binary&&e((new Uint8Array(a)).buffer)}),b.o.on("close",function(){p.websocket.P("close",a.A.C)}),b.o.on("error",function(){a.error=U.Wb;p.websocket.P("error",[a.A.C,a.error,"ECONNREFUSED: Connection refused"])})):(b.o.onopen=c,b.o.onclose=function(){p.websocket.P("close",a.A.C)},b.o.onmessage=function(a){e(a.data)},b.o.onerror=function(){a.error=U.Wb;p.websocket.P("error",[a.A.C,a.error,"ECONNREFUSED: Connection refused"])})},zc:function(a){if(1===a.type&&a.G)return a.Kb.length?65:
0;var b=0,c=1===a.type?Z.L.gb(a,a.Y,a.Z):k;if(a.ua.length||!c||c&&c.o.readyState===c.o.Pa||c&&c.o.readyState===c.o.CLOSED)b|=65;if(!c||c&&c.o.readyState===c.o.OPEN)b|=4;if(c&&c.o.readyState===c.o.Pa||c&&c.o.readyState===c.o.CLOSED)b|=16;return b},Ha:function(a,b,c){switch(b){case 21531:return b=0,a.ua.length&&(b=a.ua[0].data.length),K[c>>2]=b,0;default:return U.B}},close:function(a){if(a.G){try{a.G.close()}catch(b){}a.G=k}for(var c=Object.keys(a.Ma),e=0;e<c.length;e++){var f=a.Ma[c[e]];try{f.o.close()}catch(h){}Z.L.Bc(a,
f)}return 0},bind:function(a,b,c){("undefined"!==typeof a.Qb||"undefined"!==typeof a.ya)&&d(new B.e(U.B));a.Qb=b;a.ya=c||zb();if(2===a.type){a.G&&(a.G.close(),a.G=k);try{a.wa.Fd(a,0)}catch(e){e instanceof B.e||d(e),e.cb!==U.Ta&&d(e)}}},cg:function(a,b,c){a.G&&d(new B.e(U.Ta));if("undefined"!==typeof a.Y&&"undefined"!==typeof a.Z){var e=Z.L.gb(a,a.Y,a.Z);e&&(e.o.readyState===e.o.CONNECTING&&d(new B.e(U.Hc)),d(new B.e(U.Kc)))}b=Z.L.$a(a,b,c);a.Y=b.W;a.Z=b.port;d(new B.e(U.Jc))},Fd:function(a){t||d(new B.e(U.Ta));
a.G&&d(new B.e(U.B));var b=(null)("ws").Server;a.G=new b({host:a.Qb,port:a.ya});p.websocket.P("listen",a.A.C);a.G.on("connection",function(b){if(1===a.type){var e=Z.nd(a.qd,a.type,a.protocol),b=Z.L.$a(e,b);e.Y=b.W;e.Z=b.port;a.Kb.push(e);p.websocket.P("connection",e.A.C)}else Z.L.$a(a,b),p.websocket.P("connection",a.A.C)});a.G.on("closed",function(){p.websocket.P("close",a.A.C);a.G=k});a.G.on("error",function(){a.error=U.Yb;p.websocket.P("error",[a.A.C,a.error,"EHOSTUNREACH: Host is unreachable"])})},
accept:function(a){a.G||d(new B.e(U.B));var b=a.Kb.shift();b.A.D=a.A.D;return b},tg:function(a,b){var c,e;b?((a.Y===g||a.Z===g)&&d(new B.e(U.Ra)),c=a.Y,e=a.Z):(c=a.Qb||0,e=a.ya||0);return{W:c,port:e}},Vd:function(a,b,c,e,f,h){if(2===a.type){if(f===g||h===g)f=a.Y,h=a.Z;(f===g||h===g)&&d(new B.e(U.Ic))}else f=a.Y,h=a.Z;var j=Z.L.gb(a,f,h);1===a.type&&((!j||j.o.readyState===j.o.Pa||j.o.readyState===j.o.CLOSED)&&d(new B.e(U.Ra)),j.o.readyState===j.o.CONNECTING&&d(new B.e(U.Ca)));b=b instanceof Array||
b instanceof ArrayBuffer?b.slice(c,c+e):b.buffer.slice(b.byteOffset+c,b.byteOffset+c+e);if(2===a.type&&(!j||j.o.readyState!==j.o.OPEN)){if(!j||j.o.readyState===j.o.Pa||j.o.readyState===j.o.CLOSED)j=Z.L.$a(a,f,h);j.ab.push(b);return e}try{return j.o.send(b),e}catch(l){d(new B.e(U.B))}},Rd:function(a,b){1===a.type&&a.G&&d(new B.e(U.Ra));var c=a.ua.shift();if(!c){if(1===a.type){var e=Z.L.gb(a,a.Y,a.Z);if(e){if(e.o.readyState===e.o.Pa||e.o.readyState===e.o.CLOSED)return k;d(new B.e(U.Ca))}d(new B.e(U.Ra))}d(new B.e(U.Ca))}var e=
c.data.byteLength||c.data.length,f=c.data.byteOffset||0,h=c.data.buffer||c.data,j=Math.min(b,e),l={buffer:new Uint8Array(h,f,j),W:c.W,port:c.port};1===a.type&&j<e&&(c.data=new Uint8Array(h,f+j,e-j),a.ua.unshift(c));return l}}};function Ab(a,b,c){a=B.qa(a);if(!a)return V(U.V),-1;try{return B.write(a,I,b,c)}catch(e){return B.sc(e),-1}}p._strlen=Bb;function Cb(a){a=B.pc(a);return!a?-1:a.C}function Db(a,b){return Ab(Cb(b),a,Bb(a))}
function Eb(a,b){var c;c=a&255;c=0<=c?c:Math.pow(2,g)+c;I[Eb.Cc>>0]=c;if(-1==Ab(Cb(b),Eb.Cc,1)){if(c=B.pc(b))c.error=i;return-1}return c}function Fb(a){Fb.$c||(E=E+4095&-4096,Fb.$c=i,w(z.bb),Fb.Wc=z.bb,z.bb=function(){A("cannot dynamically allocate, sbrk now has control")});var b=E;0!=a&&Fb.Wc(a);return b}p._memset=Gb;function Hb(a,b,c){window._broadwayOnPictureDecoded(a,b,c)}p._broadwayOnPictureDecoded=Hb;function Ib(){window._broadwayOnHeadersDecoded()}p._broadwayOnHeadersDecoded=Ib;
function Jb(a,b){Kb=a;Lb=b;if(!Mb)return 1;0==a?(Nb=function(){setTimeout(Ob,b)},Pb="timeout"):1==a&&(Nb=function(){Qb(Ob)},Pb="rAF");return 0}
function Rb(a,b,c,e){p.noExitRuntime=i;w(!Mb,"emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");Mb=a;Sb=e;var f=Tb;Ob=function(){if(!H)if(0<Ub.length){var b=Date.now(),c=Ub.shift();c.ja(c.Xa);if(Vb){var l=Vb,u=0==l%1?l-1:Math.floor(l);Vb=c.dg?u:(8*l+(u+0.5))/9}console.log('main loop blocker "'+c.name+'" took '+(Date.now()-b)+" ms");p.setStatus&&(b=p.statusMessage||
"Please wait...",c=Vb,l=Wb.ig,c?c<l?p.setStatus(b+" ("+(l-c)+"/"+l+")"):p.setStatus(b):p.setStatus(""));setTimeout(Ob,0)}else if(!(f<Tb))if(Xb=Xb+1|0,1==Kb&&1<Lb&&0!=Xb%Lb)Nb();else{"timeout"===Pb&&p.fg&&(p.fa("Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!"),Pb="");a:if(!H&&!(p.preMainLoop&&p.preMainLoop()===m)){try{"undefined"!==
typeof e?z.Fa("vi",a,[e]):z.Fa("v",a)}catch(q){if(q instanceof ia)break a;q&&("object"===typeof q&&q.stack)&&p.fa("exception thrown: "+[q,q.stack]);d(q)}p.postMainLoop&&p.postMainLoop()}f<Tb||("object"===typeof SDL&&(SDL.ac&&SDL.ac.Pd)&&SDL.ac.Pd(),Nb())}};b&&0<b?Jb(0,1E3/b):Jb(1,1);Nb();c&&d("SimulateInfiniteLoop")}var Nb=k,Pb="",Tb=0,Mb=k,Sb=0,Kb=0,Lb=0,Xb=0,Ub=[],Wb={},Ob,Vb,Yb=m,rb=m,Zb=m,$b=g,ac=g,bc=0;
function cc(a){var b=Date.now();if(0===bc)bc=b+1E3/60;else for(;b+2>=bc;)bc+=1E3/60;b=Math.max(bc-b,0);setTimeout(a,b)}function Qb(a){"undefined"===typeof window?cc(a):(window.requestAnimationFrame||(window.requestAnimationFrame=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||window.msRequestAnimationFrame||window.oRequestAnimationFrame||cc),window.requestAnimationFrame(a))}
function xb(a){return{jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",bmp:"image/bmp",ogg:"audio/ogg",wav:"audio/wav",mp3:"audio/mpeg"}[a.substr(a.lastIndexOf(".")+1)]}
function yb(a,b,c){function e(){c?c():d('Loading data file "'+a+'" failed.')}var f=new XMLHttpRequest;f.open("GET",a,i);f.responseType="arraybuffer";f.onload=function(){if(200==f.status||0==f.status&&f.response){var c=f.response;w(c,'Loading data file "'+a+'" failed (no arrayBuffer).');b(new Uint8Array(c));Za()}else e()};f.onerror=e;f.send(k);Ya()}var dc=[];function ec(){var a=p.canvas;dc.forEach(function(b){b(a.width,a.height)})}
function fc(a,b,c){b&&c?(a.ae=b,a.Ad=c):(b=a.ae,c=a.Ad);var e=b,f=c;p.forcedAspectRatio&&0<p.forcedAspectRatio&&(e/f<p.forcedAspectRatio?e=Math.round(f*p.forcedAspectRatio):f=Math.round(e/p.forcedAspectRatio));if((document.webkitFullScreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.mozFullscreenElement||document.fullScreenElement||document.fullscreenElement||document.msFullScreenElement||document.msFullscreenElement||document.webkitCurrentFullScreenElement)===
a.parentNode&&"undefined"!=typeof screen)var h=Math.min(screen.width/e,screen.height/f),e=Math.round(e*h),f=Math.round(f*h);ac?(a.width!=e&&(a.width=e),a.height!=f&&(a.height=f),"undefined"!=typeof a.style&&(a.style.removeProperty("width"),a.style.removeProperty("height"))):(a.width!=b&&(a.width=b),a.height!=c&&(a.height=c),"undefined"!=typeof a.style&&(e!=b||f!=c?(a.style.setProperty("width",e+"px","important"),a.style.setProperty("height",f+"px","important")):(a.style.removeProperty("width"),a.style.removeProperty("height"))))}
var tb,ub,vb,wb;p._memcpy=gc;B.Zd();R.unshift({ja:function(){!p.noFSInit&&!B.Ga.hb&&B.Ga()}});Pa.push({ja:function(){B.vc=m}});Qa.push({ja:function(){B.Qd()}});p.FS_createFolder=B.hd;p.FS_createPath=B.ld;p.FS_createDataFile=B.xb;p.FS_createPreloadedFile=B.md;p.FS_createLazyFile=B.jd;p.FS_createLink=B.kd;p.FS_createDevice=B.X;bb=z.Ec(4);K[bb>>2]=0;R.unshift({ja:n()});Qa.push({ja:n()});var lb=new z.Da;t&&((null)("fs"),process.platform.match(/^win/));R.push({ja:function(){Z.root=B.F(Z,{},k)}});
Eb.Cc=M([0],"i8",L);
p.requestFullScreen=function(a,b){function c(){Yb=m;var a=e.parentNode;(document.webkitFullScreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.mozFullscreenElement||document.fullScreenElement||document.fullscreenElement||document.msFullScreenElement||document.msFullscreenElement||document.webkitCurrentFullScreenElement)===a?(e.cc=document.cancelFullScreen||document.mozCancelFullScreen||document.webkitCancelFullScreen||document.msExitFullscreen||document.exitFullscreen||
n(),e.cc=e.cc.bind(document),$b&&e.Pb(),Yb=i,ac&&("undefined"!=typeof SDL&&(a=Ha[SDL.screen+0*z.ia>>2],K[SDL.screen+0*z.ia>>2]=a|8388608),ec())):(a.parentNode.insertBefore(e,a),a.parentNode.removeChild(a),ac&&("undefined"!=typeof SDL&&(a=Ha[SDL.screen+0*z.ia>>2],K[SDL.screen+0*z.ia>>2]=a&-8388609),ec()));if(p.onFullScreen)p.onFullScreen(Yb);fc(e)}$b=a;ac=b;"undefined"===typeof $b&&($b=i);"undefined"===typeof ac&&(ac=m);var e=p.canvas;Zb||(Zb=i,document.addEventListener("fullscreenchange",c,m),document.addEventListener("mozfullscreenchange",
c,m),document.addEventListener("webkitfullscreenchange",c,m),document.addEventListener("MSFullscreenChange",c,m));var f=document.createElement("div");e.parentNode.insertBefore(f,e);f.appendChild(e);f.Td=f.requestFullScreen||f.mozRequestFullScreen||f.msRequestFullscreen||(f.webkitRequestFullScreen?function(){f.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT)}:k);f.Td()};p.requestAnimationFrame=function(a){Qb(a)};p.setCanvasSize=function(a,b,c){fc(p.canvas,a,b);c||ec()};
p.pauseMainLoop=function(){Nb=k;Tb++};p.resumeMainLoop=function(){Tb++;var a=Kb,b=Lb,c=Mb;Mb=k;Rb(c,0,m,Sb);Jb(a,b)};p.getUserMedia=function(){window.qc||(window.qc=navigator.getUserMedia||navigator.mozGetUserMedia);window.qc(g)};Ja=y=z.ub(D);Ka=Ja+Ma;La=E=z.ub(Ka);w(La<F,"TOTAL_MEMORY not big enough for stack");p.Xc={Math:Math,Int8Array:Int8Array,Int16Array:Int16Array,Int32Array:Int32Array,Uint8Array:Uint8Array,Uint16Array:Uint16Array,Uint32Array:Uint32Array,Float32Array:Float32Array,Float64Array:Float64Array};
p.Yc={abort:A,assert:w,min:va,invoke_viiiii:function(a,b,c,e,f,h){try{p.dynCall_viiiii(a,b,c,e,f,h)}catch(j){"number"!==typeof j&&"longjmp"!==j&&d(j),$.setThrew(1,0)}},_broadwayOnPictureDecoded:Hb,_puts:function(a){var b=K[pb>>2],a=Db(a,b);return 0>a?a:0>Eb(10,b)?-1:a+1},_fflush:n(),_fputc:Eb,_send:function(a,b,c){return!Z.wd(a)?(V(U.V),-1):Ab(a,b,c)},_pwrite:function(a,b,c,e){a=B.qa(a);if(!a)return V(U.V),-1;try{return B.write(a,I,b,c,e)}catch(f){return B.sc(f),-1}},_fputs:Db,_emscripten_set_main_loop:Rb,
_abort:function(){p.abort()},___setErrNo:V,_sbrk:Fb,_mkport:zb,_emscripten_set_main_loop_timing:Jb,_emscripten_memcpy_big:function(a,b,c){N.set(N.subarray(b,b+c),a);return a},_fileno:Cb,_broadwayOnHeadersDecoded:Ib,_write:Ab,_time:function(a){var b=Date.now()/1E3|0;a&&(K[a>>2]=b);return b},_sysconf:function(a){switch(a){case 30:return 4096;case 132:case 133:case 12:case 137:case 138:case 15:case 235:case 16:case 17:case 18:case 19:case 20:case 149:case 13:case 10:case 236:case 153:case 9:case 21:case 22:case 159:case 154:case 14:case 77:case 78:case 139:case 80:case 81:case 79:case 82:case 68:case 67:case 164:case 11:case 29:case 47:case 48:case 95:case 52:case 51:case 46:return 200809;
case 27:case 246:case 127:case 128:case 23:case 24:case 160:case 161:case 181:case 182:case 242:case 183:case 184:case 243:case 244:case 245:case 165:case 178:case 179:case 49:case 50:case 168:case 169:case 175:case 170:case 171:case 172:case 97:case 76:case 32:case 173:case 35:return-1;case 176:case 177:case 7:case 155:case 8:case 157:case 125:case 126:case 92:case 93:case 129:case 130:case 131:case 94:case 91:return 1;case 74:case 60:case 69:case 70:case 4:return 1024;case 31:case 42:case 72:return 32;
case 87:case 26:case 33:return 2147483647;case 34:case 1:return 47839;case 38:case 36:return 99;case 43:case 37:return 2048;case 0:return 2097152;case 3:return 65536;case 28:return 32768;case 44:return 32767;case 75:return 16384;case 39:return 1E3;case 89:return 700;case 71:return 256;case 40:return 255;case 2:return 100;case 180:return 64;case 25:return 20;case 5:return 16;case 6:return 6;case 73:return 4;case 84:return"object"===typeof navigator?navigator.hardwareConcurrency||1:1}V(U.B);return-1},
___errno_location:function(){return bb},STACKTOP:y,STACK_MAX:Ka,tempDoublePtr:$a,ABORT:H,NaN:NaN,Infinity:Infinity};// EMSCRIPTEN_START_ASM
var $=(function(global,env,buffer) {
"use asm";var a=new global.Int8Array(buffer);var b=new global.Int16Array(buffer);var c=new global.Int32Array(buffer);var d=new global.Uint8Array(buffer);var e=new global.Uint16Array(buffer);var f=new global.Uint32Array(buffer);var g=new global.Float32Array(buffer);var h=new global.Float64Array(buffer);var i=env.STACKTOP|0;var j=env.STACK_MAX|0;var k=env.tempDoublePtr|0;var l=env.ABORT|0;var m=0;var n=0;var o=0;var p=0;var q=+env.NaN,r=+env.Infinity;var s=0,t=0,u=0,v=0,w=0.0,x=0,y=0,z=0,A=0.0;var B=0;var C=0;var D=0;var E=0;var F=0;var G=0;var H=0;var I=0;var J=0;var K=0;var L=global.Math.floor;var M=global.Math.abs;var N=global.Math.sqrt;var O=global.Math.pow;var P=global.Math.cos;var Q=global.Math.sin;var R=global.Math.tan;var S=global.Math.acos;var T=global.Math.asin;var U=global.Math.atan;var V=global.Math.atan2;var W=global.Math.exp;var X=global.Math.log;var Y=global.Math.ceil;var Z=global.Math.imul;var _=env.abort;var $=env.assert;var aa=env.min;var ba=env.invoke_viiiii;var ca=env._broadwayOnPictureDecoded;var da=env._puts;var ea=env._fflush;var fa=env._fputc;var ga=env._send;var ha=env._pwrite;var ia=env._fputs;var ja=env._emscripten_set_main_loop;var ka=env._abort;var la=env.___setErrNo;var ma=env._sbrk;var na=env._mkport;var oa=env._emscripten_set_main_loop_timing;var pa=env._emscripten_memcpy_big;var qa=env._fileno;var ra=env._broadwayOnHeadersDecoded;var sa=env._write;var ta=env._time;var ua=env._sysconf;var va=env.___errno_location;var wa=0.0;
// EMSCRIPTEN_START_FUNCS
function Sb(a,f,g,h,j,k){a=a|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;var l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0,O=0,P=0,Q=0,R=0,S=0,T=0,U=0,V=0,W=0,X=0;X=i;i=i+32|0;W=X;p=c[j+4>>2]|0;V=(h>>>0)/(p>>>0)|0;U=V<<4;V=h-(Z(V,p)|0)<<4;c[W+4>>2]=p;c[W+8>>2]=c[j+8>>2];p=c[a>>2]|0;do if((p|0)==1|(p|0)==0){A=c[f+144>>2]|0;l=a+4|0;n=c[a+200>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[l>>2]|0):0)if((c[n>>2]|0)>>>0<6){o=n+152|0;o=e[o>>1]|e[o+2>>1]<<16;m=1;v=o&65535;o=o>>>16&65535;s=c[n+104>>2]|0}else{m=1;v=0;o=0;s=-1}else{m=0;v=0;o=0;s=-1}n=c[a+204>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[l>>2]|0):0)if((c[n>>2]|0)>>>0<6){w=n+172|0;w=e[w>>1]|e[w+2>>1]<<16;u=w&65535;q=1;r=c[n+108>>2]|0;w=w>>>16&65535}else{u=0;q=1;r=-1;w=0}else{u=0;q=0;r=-1;w=0}do if(!p)if(!((m|0)==0|(q|0)==0)){if((s|0)==0?((o&65535)<<16|v&65535|0)==0:0){n=0;o=0;break}if((r|0)==0?((w&65535)<<16|u&65535|0)==0:0){n=0;o=0}else T=16}else{n=0;o=0}else T=16;while(0);if((T|0)==16){y=b[f+160>>1]|0;z=b[f+162>>1]|0;n=c[a+208>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[l>>2]|0):0)if((c[n>>2]|0)>>>0<6){t=n+172|0;p=c[n+108>>2]|0;t=e[t>>1]|e[t+2>>1]<<16;T=25}else{p=-1;t=0;T=25}else T=20;do if((T|0)==20){p=c[a+212>>2]|0;if((p|0)!=0?(c[p+4>>2]|0)==(c[l>>2]|0):0){if((c[p>>2]|0)>>>0>=6){p=-1;t=0;T=25;break}t=p+192|0;p=c[p+112>>2]|0;t=e[t>>1]|e[t+2>>1]<<16;T=25;break}if((m|0)==0|(q|0)!=0){p=-1;t=0;T=25}else n=v}while(0);do if((T|0)==25){m=(s|0)==(A|0);n=(r|0)==(A|0);if(((n&1)+(m&1)+((p|0)==(A|0)&1)|0)==1){if(m|n){n=m?v:u;o=m?o:w;break}n=t&65535;o=t>>>16&65535;break}n=v<<16>>16;l=u<<16>>16;p=t<<16>>16;if(u<<16>>16>v<<16>>16)m=l;else{m=n;n=(l|0)<(n|0)?l:n}if((m|0)<(p|0))p=m;else p=(n|0)>(p|0)?n:p;n=o<<16>>16;m=w<<16>>16;l=t>>16;if(w<<16>>16>o<<16>>16)o=m;else{o=n;n=(m|0)<(n|0)?m:n}if((o|0)>=(l|0))o=(n|0)>(l|0)?n:l;n=p&65535;o=o&65535}while(0);n=(n&65535)+(y&65535)|0;o=(o&65535)+(z&65535)|0;if(((n<<16>>16)+8192|0)>>>0>16383){G=1;i=X;return G|0}if(((o<<16>>16)+2048|0)>>>0>4095){G=1;i=X;return G|0}else{n=n&65535;o=o&65535}}l=ic(g,A)|0;if(!l){G=1;i=X;return G|0}else{G=a+132|0;E=a+136|0;D=a+140|0;C=a+144|0;B=a+148|0;z=a+152|0;y=a+156|0;x=a+160|0;w=a+164|0;v=a+168|0;m=a+172|0;p=a+176|0;q=a+180|0;r=a+184|0;s=a+188|0;F=a+192|0;b[a+192>>1]=n;b[a+194>>1]=o;F=e[F>>1]|e[F+2>>1]<<16;b[s>>1]=F;b[s+2>>1]=F>>>16;b[r>>1]=F;b[r+2>>1]=F>>>16;b[q>>1]=F;b[q+2>>1]=F>>>16;b[p>>1]=F;b[p+2>>1]=F>>>16;b[m>>1]=F;b[m+2>>1]=F>>>16;b[v>>1]=F;b[v+2>>1]=F>>>16;b[w>>1]=F;b[w+2>>1]=F>>>16;b[x>>1]=F;b[x+2>>1]=F>>>16;b[y>>1]=F;b[y+2>>1]=F>>>16;b[z>>1]=F;b[z+2>>1]=F>>>16;b[B>>1]=F;b[B+2>>1]=F>>>16;b[C>>1]=F;b[C+2>>1]=F>>>16;b[D>>1]=F;b[D+2>>1]=F>>>16;b[E>>1]=F;b[E+2>>1]=F>>>16;b[G>>1]=F;b[G+2>>1]=F>>>16;c[a+100>>2]=A;c[a+104>>2]=A;c[a+108>>2]=A;c[a+112>>2]=A;c[a+116>>2]=l;c[a+120>>2]=l;c[a+124>>2]=l;c[a+128>>2]=l;c[W>>2]=l;dc(k,a+132|0,W,V,U,0,0,16,16);break}}else if((p|0)==3){x=b[f+160>>1]|0;y=b[f+162>>1]|0;C=c[f+144>>2]|0;u=a+4|0;o=c[a+200>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[u>>2]|0):0)if((c[o>>2]|0)>>>0<6){w=o+152|0;w=e[w>>1]|e[w+2>>1]<<16;n=1;s=w&65535;w=w>>>16&65535;o=c[o+104>>2]|0}else{n=1;s=0;w=0;o=-1}else{n=0;s=0;w=0;o=-1}a:do if((o|0)==(C|0)){n=s;o=w}else{o=c[a+204>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[u>>2]|0):0)if((c[o>>2]|0)>>>0<6){G=o+172|0;G=e[G>>1]|e[G+2>>1]<<16;t=o+188|0;p=c[o+108>>2]|0;l=c[o+112>>2]|0;n=G&65535;o=G>>>16&65535;t=e[t>>1]|e[t+2>>1]<<16}else{p=-1;l=-1;n=0;o=0;t=0}else T=107;do if((T|0)==107){o=c[a+212>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[u>>2]|0):0){if((c[o>>2]|0)>>>0>=6){p=-1;l=-1;n=0;o=0;t=0;break}t=o+192|0;p=-1;l=c[o+112>>2]|0;n=0;o=0;t=e[t>>1]|e[t+2>>1]<<16;break}if(!n){p=-1;l=-1;n=0;o=0;t=0}else{n=s;o=w;break a}}while(0);m=(p|0)==(C|0);if(((m&1)+((l|0)==(C|0)&1)|0)==1){if(m)break;n=t&65535;o=t>>>16&65535;break}l=s<<16>>16;p=n<<16>>16;q=t<<16>>16;if(n<<16>>16>s<<16>>16){m=p;n=l}else{m=l;n=(p|0)<(l|0)?p:l}if((m|0)<(q|0))q=m;else q=(n|0)>(q|0)?n:q;n=w<<16>>16;m=o<<16>>16;l=t>>16;if(o<<16>>16>w<<16>>16)o=m;else{o=n;n=(m|0)<(n|0)?m:n}if((o|0)>=(l|0))o=(n|0)>(l|0)?n:l;n=q&65535;o=o&65535}while(0);n=(n&65535)+(x&65535)|0;o=(o&65535)+(y&65535)|0;if(((n<<16>>16)+8192|0)>>>0>16383){G=1;i=X;return G|0}if(((o<<16>>16)+2048|0)>>>0>4095){G=1;i=X;return G|0}m=ic(g,C)|0;if(!m){G=1;i=X;return G|0}x=a+132|0;z=a+136|0;A=a+140|0;y=a+144|0;G=a+164|0;F=a+168|0;E=a+172|0;w=a+176|0;b[a+176>>1]=n;b[a+178>>1]=o;w=e[w>>1]|e[w+2>>1]<<16;b[E>>1]=w;b[E+2>>1]=w>>>16;b[F>>1]=w;b[F+2>>1]=w>>>16;b[G>>1]=w;b[G+2>>1]=w>>>16;b[y>>1]=w;b[y+2>>1]=w>>>16;b[A>>1]=w;b[A+2>>1]=w>>>16;b[z>>1]=w;b[z+2>>1]=w>>>16;b[x>>1]=w;b[x+2>>1]=w>>>16;c[a+100>>2]=C;c[a+108>>2]=C;x=a+116|0;c[x>>2]=m;c[a+124>>2]=m;z=b[f+164>>1]|0;A=b[f+166>>1]|0;y=c[f+148>>2]|0;o=c[a+208>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[u>>2]|0):0)if((c[o>>2]|0)>>>0<6){r=o+172|0;o=c[o+108>>2]|0;p=1;r=e[r>>1]|e[r+2>>1]<<16}else{o=-1;p=1;r=0}else{o=c[a+204>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[u>>2]|0):0)if((c[o>>2]|0)>>>0<6){r=o+176|0;o=c[o+108>>2]|0;p=1;r=e[r>>1]|e[r+2>>1]<<16}else{o=-1;p=1;r=0}else{o=-1;p=0;r=0}}do if((o|0)!=(y|0)){s=w&65535;o=w>>>16;v=o&65535;n=c[a+204>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[u>>2]|0):0)if((c[n>>2]|0)>>>0<6){u=n+188|0;u=e[u>>1]|e[u+2>>1]<<16;p=c[n+112>>2]|0;l=u&65535;u=u>>>16&65535}else{p=-1;l=0;u=0}else if(!p){m=w;break}else{p=-1;l=0;u=0}m=(C|0)==(y|0);n=(p|0)==(y|0);if(((n&1)+(m&1)|0)==1){if(m){m=w;break}if(n){o=u&65535;m=o<<16|l&65535;break}else{m=r;o=r>>>16;break}}o=w<<16>>16;p=l<<16>>16;q=r<<16>>16;if(l<<16>>16>s<<16>>16)m=p;else{m=o;o=(p|0)<(o|0)?p:o}if((m|0)>=(q|0))m=(o|0)>(q|0)?o:q;n=w>>16;l=u<<16>>16;p=r>>16;if(u<<16>>16>v<<16>>16)o=l;else{o=n;n=(l|0)<(n|0)?l:n}if((o|0)>=(p|0))o=(n|0)>(p|0)?n:p}else{m=r;o=r>>>16}while(0);m=(m&65535)+(z&65535)|0;n=(o&65535)+(A&65535)|0;if(((m<<16>>16)+8192|0)>>>0>16383){G=1;i=X;return G|0}if(((n<<16>>16)+2048|0)>>>0>4095){G=1;i=X;return G|0}o=ic(g,y)|0;if(!o){G=1;i=X;return G|0}else{G=a+148|0;E=a+152|0;D=a+156|0;C=a+160|0;B=a+180|0;A=a+184|0;z=a+188|0;F=a+192|0;b[a+192>>1]=m;b[a+194>>1]=n;F=e[F>>1]|e[F+2>>1]<<16;b[z>>1]=F;b[z+2>>1]=F>>>16;b[A>>1]=F;b[A+2>>1]=F>>>16;b[B>>1]=F;b[B+2>>1]=F>>>16;b[C>>1]=F;b[C+2>>1]=F>>>16;b[D>>1]=F;b[D+2>>1]=F>>>16;b[E>>1]=F;b[E+2>>1]=F>>>16;b[G>>1]=F;b[G+2>>1]=F>>>16;c[a+104>>2]=y;c[a+112>>2]=y;F=a+120|0;c[F>>2]=o;c[a+128>>2]=o;c[W>>2]=c[x>>2];dc(k,a+132|0,W,V,U,0,0,8,16);c[W>>2]=c[F>>2];dc(k,G,W,V,U,8,0,8,16);break}}else if((p|0)==2){z=b[f+160>>1]|0;A=b[f+162>>1]|0;C=c[f+144>>2]|0;B=a+4|0;o=c[a+204>>2]|0;if((o|0)!=0?(c[o+4>>2]|0)==(c[B>>2]|0):0)if((c[o>>2]|0)>>>0<6){w=o+172|0;w=e[w>>1]|e[w+2>>1]<<16;m=1;o=c[o+108>>2]|0;r=w&65535;w=w>>>16&65535}else{m=1;o=-1;r=0;w=0}else{m=0;o=-1;r=0;w=0}b:do if((o|0)==(C|0)){n=r;o=w}else{n=c[a+200>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[B>>2]|0):0)if((c[n>>2]|0)>>>0<6){o=n+152|0;o=e[o>>1]|e[o+2>>1]<<16;q=1;s=o&65535;o=o>>>16&65535;p=c[n+104>>2]|0}else{q=1;s=0;o=0;p=-1}else{q=0;s=0;o=0;p=-1}n=c[a+208>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[B>>2]|0):0)if((c[n>>2]|0)>>>0<6){t=n+172|0;n=c[n+108>>2]|0;t=e[t>>1]|e[t+2>>1]<<16}else{n=-1;t=0}else T=54;do if((T|0)==54){n=c[a+212>>2]|0;if((n|0)!=0?(c[n+4>>2]|0)==(c[B>>2]|0):0){if((c[n>>2]|0)>>>0>=6){n=-1;t=0;break}t=n+192|0;n=c[n+112>>2]|0;t=e[t>>1]|e[t+2>>1]<<16;break}if((q|0)==0|(m|0)!=0){n=-1;t=0}else{n=s;break b}}while(0);m=(p|0)==(C|0);if((((n|0)==(C|0)&1)+(m&1)|0)==1){if(m){n=m?s:r;o=m?o:w;break}n=t&65535;o=t>>>16&65535;break}n=s<<16>>16;l=r<<16>>16;p=t<<16>>16;if(r<<16>>16>s<<16>>16)m=l;else{m=n;n=(l|0)<(n|0)?l:n}if((m|0)<(p|0))q=m;else q=(n|0)>(p|0)?n:p;n=o<<16>>16;m=w<<16>>16;l=t>>16;if(w<<16>>16>o<<16>>16)o=m;else{o=n;n=(m|0)<(n|0)?m:n}if((o|0)>=(l|0))o=(n|0)>(l|0)?n:l;n=q&65535;o=o&65535}while(0);n=(n&65535)+(z&65535)|0;o=(o&65535)+(A&65535)|0;if(((n<<16>>16)+8192|0)>>>0>16383){G=1;i=X;return G|0}if(((o<<16>>16)+2048|0)>>>0>4095){G=1;i=X;return G|0}m=ic(g,C)|0;if(!m){G=1;i=X;return G|0}A=a+132|0;x=a+136|0;y=a+140|0;z=a+144|0;q=a+148|0;p=a+152|0;G=a+156|0;v=a+160|0;b[a+160>>1]=n;b[a+162>>1]=o;v=e[v>>1]|e[v+2>>1]<<16;b[G>>1]=v;b[G+2>>1]=v>>>16;b[p>>1]=v;b[p+2>>1]=v>>>16;b[q>>1]=v;b[q+2>>1]=v>>>16;b[z>>1]=v;b[z+2>>1]=v>>>16;b[y>>1]=v;b[y+2>>1]=v>>>16;b[x>>1]=v;b[x+2>>1]=v>>>16;b[A>>1]=v;b[A+2>>1]=v>>>16;c[a+100>>2]=C;c[a+104>>2]=C;A=a+116|0;c[A>>2]=m;c[a+120>>2]=m;x=b[f+164>>1]|0;y=b[f+166>>1]|0;z=c[f+148>>2]|0;q=c[a+200>>2]|0;p=(q|0)==0;if((!p?(c[q+4>>2]|0)==(c[B>>2]|0):0)?(c[q>>2]|0)>>>0<6:0){w=q+184|0;w=e[w>>1]|e[w+2>>1]<<16;r=w&65535;w=w>>>16&65535;o=c[q+112>>2]|0}else{r=0;w=0;o=-1}do if((o|0)!=(z|0)){s=v&65535;n=v>>>16;u=n&65535;if((!p?(c[q+4>>2]|0)==(c[B>>2]|0):0)?(c[q>>2]|0)>>>0<6:0){t=q+160|0;p=c[q+104>>2]|0;t=e[t>>1]|e[t+2>>1]<<16}else{p=-1;t=0}o=(C|0)==(z|0);if((((p|0)==(z|0)&1)+(o&1)|0)==1){m=o?v:t;o=o?n:t>>>16;break}o=r<<16>>16;p=v<<16>>16;q=t<<16>>16;if(s<<16>>16>r<<16>>16)m=p;else{m=o;o=(p|0)<(o|0)?p:o}if((m|0)>=(q|0))m=(o|0)>(q|0)?o:q;n=w<<16>>16;l=v>>16;p=t>>16;if(u<<16>>16>w<<16>>16)o=l;else{o=n;n=(l|0)<(n|0)?l:n}if((o|0)>=(p|0))o=(n|0)>(p|0)?n:p}else{o=w&65535;m=o<<16|r&65535}while(0);m=(m&65535)+(x&65535)|0;n=(o&65535)+(y&65535)|0;if(((m<<16>>16)+8192|0)>>>0>16383){G=1;i=X;return G|0}if(((n<<16>>16)+2048|0)>>>0>4095){G=1;i=X;return G|0}o=ic(g,z)|0;if(!o){G=1;i=X;return G|0}else{G=a+164|0;E=a+168|0;D=a+172|0;C=a+176|0;B=a+180|0;y=a+184|0;x=a+188|0;F=a+192|0;b[a+192>>1]=m;b[a+194>>1]=n;F=e[F>>1]|e[F+2>>1]<<16;b[x>>1]=F;b[x+2>>1]=F>>>16;b[y>>1]=F;b[y+2>>1]=F>>>16;b[B>>1]=F;b[B+2>>1]=F>>>16;b[C>>1]=F;b[C+2>>1]=F>>>16;b[D>>1]=F;b[D+2>>1]=F>>>16;b[E>>1]=F;b[E+2>>1]=F>>>16;b[G>>1]=F;b[G+2>>1]=F>>>16;c[a+108>>2]=z;c[a+112>>2]=z;F=a+124|0;c[F>>2]=o;c[a+128>>2]=o;c[W>>2]=c[A>>2];dc(k,a+132|0,W,V,U,0,0,16,8);c[W>>2]=c[F>>2];dc(k,G,W,V,U,0,8,16,8);break}}else{S=a+4|0;H=0;c:while(1){D=f+(H<<2)+176|0;G=eb(c[D>>2]|0)|0;E=f+(H<<2)+192|0;c[a+(H<<2)+100>>2]=c[E>>2];F=ic(g,c[E>>2]|0)|0;c[a+(H<<2)+116>>2]=F;if(!F){l=1;T=212;break}if(G){J=H<<2;K=a+(J<<2)+132|0;O=a+(J<<2)+134|0;P=J|1;L=a+(P<<2)+132|0;P=a+(P<<2)+134|0;Q=J|2;M=a+(Q<<2)+132|0;Q=a+(Q<<2)+134|0;R=J|3;N=a+(R<<2)+132|0;R=a+(R<<2)+134|0;I=0;do{C=b[f+(H<<4)+(I<<2)+208>>1]|0;B=b[f+(H<<4)+(I<<2)+210>>1]|0;F=hb(c[D>>2]|0)|0;n=c[E>>2]|0;s=ub(a,c[6288+(H<<7)+(F<<5)+(I<<3)>>2]|0)|0;r=d[6288+(H<<7)+(F<<5)+(I<<3)+4>>0]|0;if((s|0)!=0?(c[s+4>>2]|0)==(c[S>>2]|0):0)if((c[s>>2]|0)>>>0<6){q=s+(r<<2)+132|0;q=e[q>>1]|e[q+2>>1]<<16;A=c[s+(r>>>2<<2)+100>>2]|0;o=q&65535;z=1;q=q>>>16&65535}else{A=-1;o=0;z=1;q=0}else{A=-1;o=0;z=0;q=0}v=ub(a,c[5776+(H<<7)+(F<<5)+(I<<3)>>2]|0)|0;l=d[5776+(H<<7)+(F<<5)+(I<<3)+4>>0]|0;if((v|0)!=0?(c[v+4>>2]|0)==(c[S>>2]|0):0)if((c[v>>2]|0)>>>0<6){p=v+(l<<2)+132|0;p=e[p>>1]|e[p+2>>1]<<16;y=1;x=c[v+(l>>>2<<2)+100>>2]|0;m=p&65535;p=p>>>16&65535}else{y=1;x=-1;m=0;p=0}else{y=0;x=-1;m=0;p=0}w=ub(a,c[5264+(H<<7)+(F<<5)+(I<<3)>>2]|0)|0;v=d[5264+(H<<7)+(F<<5)+(I<<3)+4>>0]|0;if((w|0)!=0?(c[w+4>>2]|0)==(c[S>>2]|0):0)if((c[w>>2]|0)>>>0<6){z=w+(v<<2)+132|0;z=e[z>>1]|e[z+2>>1]<<16;v=c[w+(v>>>2<<2)+100>>2]|0;T=180}else{z=0;v=-1;T=180}else T=175;do if((T|0)==175){T=0;w=ub(a,c[4752+(H<<7)+(F<<5)+(I<<3)>>2]|0)|0;v=d[4752+(H<<7)+(F<<5)+(I<<3)+4>>0]|0;if((w|0)!=0?(c[w+4>>2]|0)==(c[S>>2]|0):0){if((c[w>>2]|0)>>>0>=6){z=0;v=-1;T=180;break}z=w+(v<<2)+132|0;z=e[z>>1]|e[z+2>>1]<<16;v=c[w+(v>>>2<<2)+100>>2]|0;T=180;break}if((z|0)==0|(y|0)!=0){z=0;v=-1;T=180}else{v=o;t=q}}while(0);do if((T|0)==180){l=(A|0)==(n|0);w=(x|0)==(n|0);if(((w&1)+(l&1)+((v|0)==(n|0)&1)|0)==1){if(l|w){v=l?o:m;t=l?q:p;break}v=z&65535;t=z>>>16&65535;break}u=o<<16>>16;w=m<<16>>16;l=z<<16>>16;if(m<<16>>16>o<<16>>16)v=w;else{v=u;u=(w|0)<(u|0)?w:u}if((v|0)<(l|0))w=v;else w=(u|0)>(l|0)?u:l;t=q<<16>>16;v=p<<16>>16;l=z>>16;if(p<<16>>16>q<<16>>16)s=v;else{s=t;t=(v|0)<(t|0)?v:t}if((s|0)>=(l|0))s=(t|0)>(l|0)?t:l;v=w&65535;t=s&65535}while(0);C=(v&65535)+(C&65535)|0;q=C&65535;s=(t&65535)+(B&65535)|0;r=s&65535;if(((C<<16>>16)+8192|0)>>>0>16383){l=1;T=212;break c}if(((s<<16>>16)+2048|0)>>>0>4095){l=1;T=212;break c}if(!F){b[K>>1]=q;b[O>>1]=r;b[L>>1]=q;b[P>>1]=r;b[M>>1]=q;b[Q>>1]=r;b[N>>1]=q;b[R>>1]=r}else if((F|0)==1){F=(I<<1)+J|0;b[a+(F<<2)+132>>1]=q;b[a+(F<<2)+134>>1]=r;F=F|1;b[a+(F<<2)+132>>1]=q;b[a+(F<<2)+134>>1]=r}else if((F|0)==2){F=I+J|0;b[a+(F<<2)+132>>1]=q;b[a+(F<<2)+134>>1]=r;F=F+2|0;b[a+(F<<2)+132>>1]=q;b[a+(F<<2)+134>>1]=r}else if((F|0)==3){F=I+J|0;b[a+(F<<2)+132>>1]=q;b[a+(F<<2)+134>>1]=r}I=I+1|0}while(I>>>0<G>>>0)}H=H+1|0;if(H>>>0>=4){T=201;break}}if((T|0)==201){o=0;do{c[W>>2]=c[a+(o<<2)+116>>2];m=hb(c[f+(o<<2)+176>>2]|0)|0;l=o<<3&8;n=o>>>0<2?0:8;if(!m)dc(k,a+(o<<2<<2)+132|0,W,V,U,l,n,8,8);else if((m|0)==1){G=o<<2;dc(k,a+(G<<2)+132|0,W,V,U,l,n,8,4);dc(k,a+((G|2)<<2)+132|0,W,V,U,l,n|4,8,4)}else if((m|0)==2){G=o<<2;dc(k,a+(G<<2)+132|0,W,V,U,l,n,4,8);dc(k,a+((G|1)<<2)+132|0,W,V,U,l|4,n,4,8)}else{E=o<<2;dc(k,a+(E<<2)+132|0,W,V,U,l,n,4,4);F=l|4;dc(k,a+((E|1)<<2)+132|0,W,V,U,F,n,4,4);G=n|4;dc(k,a+((E|2)<<2)+132|0,W,V,U,l,G,4,4);dc(k,a+((E|3)<<2)+132|0,W,V,U,F,G,4,4)}o=o+1|0}while((o|0)!=4)}else if((T|0)==212){i=X;return l|0}}while(0);if((c[a+196>>2]|0)>>>0>1){G=0;i=X;return G|0}if(!(c[a>>2]|0)){sc(j,k);G=0;i=X;return G|0}else{tc(j,h,k,f+328|0);G=0;i=X;return G|0}return 0}function Tb(b,c,e,f,g,h,j,k,l){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0;B=i;i=i+144|0;m=B;if((e|0)>=0?!((e+1+k|0)>>>0>g>>>0|(f|0)<0|(l+f|0)>>>0>h>>>0):0)m=b;else{A=k+1|0;Ub(b,m,e,f,g,h,A,l,A);Ub(b+(Z(h,g)|0)|0,m+(Z(A,l)|0)|0,e,f,g,h,A,l,A);h=l;g=A;e=0;f=0}A=8-j|0;v=l>>>1;z=(v|0)==0;w=k>>>1;y=(w|0)==0;x=16-k|0;u=(g<<1)-k|0;s=g+1|0;t=g+2|0;p=w<<1;r=0;do{l=m+((Z((Z(r,h)|0)+f|0,g)|0)+e)|0;if(!(z|y)){q=c+(r<<6)|0;o=v;while(1){k=q;b=l;n=w;while(1){D=d[b>>0]|0;E=d[b+s>>0]|0;F=b;b=b+2|0;C=d[F+1>>0]|0;a[k+8>>0]=(((Z(E,j)|0)+(Z(d[F+g>>0]|0,A)|0)<<3)+32|0)>>>6;a[k>>0]=(((Z(C,j)|0)+(Z(D,A)|0)<<3)+32|0)>>>6;D=d[b>>0]|0;a[k+9>>0]=(((Z(d[F+t>>0]|0,j)|0)+(Z(E,A)|0)<<3)+32|0)>>>6;a[k+1>>0]=(((Z(D,j)|0)+(Z(C,A)|0)<<3)+32|0)>>>6;n=n+-1|0;if(!n)break;else k=k+2|0}o=o+-1|0;if(!o)break;else{q=q+(p+x)|0;l=l+(p+u)|0}}}r=r+1|0}while((r|0)!=2);i=B;return}function Ub(a,b,c,d,e,f,g,h,j){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0;t=i;k=g+c|0;o=h+d|0;s=(c|0)<0|(k|0)>(e|0)?2:1;m=(o|0)<0?0-h|0:d;d=(k|0)<0?0-g|0:c;m=(m|0)>(f|0)?f:m;d=(d|0)>(e|0)?e:d;k=d+g|0;l=m+h|0;if((d|0)>0)a=a+d|0;if((m|0)>0)a=a+(Z(m,e)|0)|0;r=(d|0)<0?0-d|0:0;q=(k|0)>(e|0)?k-e|0:0;p=g-r-q|0;g=0-m|0;m=(m|0)<0?g:0;c=l-f|0;n=(l|0)>(f|0)?c:0;k=h-m|0;d=k-n|0;if(m){m=h+-1-((o|0)>0?o:0)|0;l=~f;l=(m|0)>(l|0)?m:l;m=~l;m=Z(l+((m|0)>0?m:0)+1|0,j)|0;l=b;while(1){xa[s&3](a,l,r,p,q);g=g+-1|0;if(!g)break;else l=l+j|0}b=b+m|0}if((k|0)!=(n|0)){l=h+-1|0;g=l-((o|0)>0?o:0)|0;k=~f;k=(g|0)>(k|0)?g:k;l=l-k|0;g=~k;g=h+f+-1-((l|0)<(f|0)?f:l)-k-((g|0)>0?g:0)|0;k=Z(g,j)|0;g=Z(g,e)|0;l=b;m=a;while(1){xa[s&3](m,l,r,p,q);d=d+-1|0;if(!d)break;else{l=l+j|0;m=m+e|0}}b=b+k|0;a=a+g|0}a=a+(0-e)|0;if(!n){i=t;return}while(1){xa[s&3](a,b,r,p,q);c=c+-1|0;if(!c)break;else b=b+j|0}i=t;return}function Vb(b,c,e,f,g,h,j,k,l){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0;C=i;i=i+144|0;m=C;if(((e|0)>=0?!((k+e|0)>>>0>g>>>0|(f|0)<0):0)?(f+1+l|0)>>>0<=h>>>0:0)m=b;else{A=l+1|0;Ub(b,m,e,f,g,h,k,A,k);Ub(b+(Z(h,g)|0)|0,m+(Z(A,k)|0)|0,e,f,g,h,k,A,k);h=A;g=k;e=0;f=0}B=8-j|0;w=l>>>1;A=(w|0)==0;x=k>>>1;z=(x|0)==0;y=16-k|0;v=g<<1;u=v-k|0;t=v|1;s=g+1|0;p=x<<1;r=0;do{l=m+((Z((Z(r,h)|0)+f|0,g)|0)+e)|0;if(!(A|z)){q=c+(r<<6)|0;o=w;while(1){k=q;b=l;n=x;while(1){D=d[b+g>>0]|0;E=d[b>>0]|0;a[k+8>>0]=(((Z(D,B)|0)+(Z(d[b+v>>0]|0,j)|0)<<3)+32|0)>>>6;a[k>>0]=(((Z(E,B)|0)+(Z(D,j)|0)<<3)+32|0)>>>6;D=d[b+s>>0]|0;E=d[b+1>>0]|0;a[k+9>>0]=(((Z(D,B)|0)+(Z(d[b+t>>0]|0,j)|0)<<3)+32|0)>>>6;a[k+1>>0]=(((Z(E,B)|0)+(Z(D,j)|0)<<3)+32|0)>>>6;n=n+-1|0;if(!n)break;else{k=k+2|0;b=b+2|0}}o=o+-1|0;if(!o)break;else{q=q+(p+y)|0;l=l+(p+u)|0}}}r=r+1|0}while((r|0)!=2);i=C;return}function Wb(b,c,e,f,g,h,j,k,l,m){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;m=m|0;var n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0;I=i;i=i+176|0;n=I;if(((e|0)>=0?!((e+1+l|0)>>>0>g>>>0|(f|0)<0):0)?(f+1+m|0)>>>0<=h>>>0:0)n=b;else{B=l+1|0;A=m+1|0;Ub(b,n,e,f,g,h,B,A,B);Ub(b+(Z(h,g)|0)|0,n+(Z(A,B)|0)|0,e,f,g,h,B,A,B);h=A;g=B;e=0;f=0}G=8-j|0;H=8-k|0;B=m>>>1;E=(B|0)==0;A=g<<1;C=l>>>1;F=(C|0)==0;D=16-l|0;z=A-l|0;v=g+1|0;w=A|1;x=g+2|0;y=A+2|0;s=C<<1;u=0;do{l=n+((Z((Z(u,h)|0)+f|0,g)|0)+e)|0;if(!(E|F)){t=c+(u<<6)|0;r=B;while(1){p=d[l+g>>0]|0;m=t;b=l;o=(Z(p,k)|0)+(Z(d[l>>0]|0,H)|0)|0;p=(Z(d[l+A>>0]|0,k)|0)+(Z(p,H)|0)|0;q=C;while(1){K=d[b+v>>0]|0;J=(Z(K,k)|0)+(Z(d[b+1>>0]|0,H)|0)|0;K=(Z(d[b+w>>0]|0,k)|0)+(Z(K,H)|0)|0;M=((Z(o,G)|0)+32+(Z(J,j)|0)|0)>>>6;a[m+8>>0]=((Z(p,G)|0)+32+(Z(K,j)|0)|0)>>>6;a[m>>0]=M;M=b;b=b+2|0;L=d[M+x>>0]|0;o=(Z(L,k)|0)+(Z(d[b>>0]|0,H)|0)|0;p=(Z(d[M+y>>0]|0,k)|0)+(Z(L,H)|0)|0;J=((Z(J,G)|0)+32+(Z(o,j)|0)|0)>>>6;a[m+9>>0]=((Z(K,G)|0)+32+(Z(p,j)|0)|0)>>>6;a[m+1>>0]=J;q=q+-1|0;if(!q)break;else m=m+2|0}r=r+-1|0;if(!r)break;else{t=t+(s+D)|0;l=l+(s+z)|0}}}u=u+1|0}while((u|0)!=2);i=I;return}function Xb(b,c,e,f,g,h,j,k){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;var l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0;r=i;i=i+448|0;l=r;if(((e|0)>=0?!((j+e|0)>>>0>g>>>0|(f|0)<0):0)?(f+5+k|0)>>>0<=h>>>0:0)l=b;else{Ub(b,l,e,f,g,h,j,k+5|0,j);g=j;e=0;f=0}h=e+g+(Z(f,g)|0)|0;b=k>>>2;if(!b){i=r;return}n=g<<2;q=0-g|0;o=q<<1;p=g<<1;if(!j){i=r;return}else{m=l+h|0;e=l+(h+(g*5|0))|0}while(1){l=j;h=c;k=m;f=e;while(1){u=d[f+o>>0]|0;v=d[f+q>>0]|0;w=d[f+g>>0]|0;y=d[f>>0]|0;x=w+u|0;s=d[k+p>>0]|0;a[h+48>>0]=a[((d[f+p>>0]|0)+16-x-(x<<2)+s+((y+v|0)*20|0)>>5)+3984>>0]|0;x=s+y|0;t=d[k+g>>0]|0;a[h+32>>0]=a[(w+16-x-(x<<2)+t+((v+u|0)*20|0)>>5)+3984>>0]|0;x=t+v|0;w=d[k>>0]|0;a[h+16>>0]=a[(y+16-x-(x<<2)+w+((s+u|0)*20|0)>>5)+3984>>0]|0;u=w+u|0;a[h>>0]=a[(v+16-u-(u<<2)+(d[k+q>>0]|0)+((t+s|0)*20|0)>>5)+3984>>0]|0;l=l+-1|0;if(!l)break;else{h=h+1|0;k=k+1|0;f=f+1|0}}b=b+-1|0;if(!b)break;else{c=c+64|0;m=m+n|0;e=e+n|0}}i=r;return}function Yb(b,c,e,f,g,h,j,k,l){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0;v=i;i=i+448|0;m=v;if(((e|0)>=0?!((j+e|0)>>>0>g>>>0|(f|0)<0):0)?(f+5+k|0)>>>0<=h>>>0:0)m=b;else{Ub(b,m,e,f,g,h,j,k+5|0,j);g=j;e=0;f=0}h=e+g+(Z(f,g)|0)|0;b=k>>>2;if(!b){i=v;return}u=(j|0)==0;s=(g<<2)-j|0;t=64-j|0;r=0-g|0;p=r<<1;q=g<<1;e=m+h|0;f=m+(h+(Z(g,l+2|0)|0))|0;m=m+(h+(g*5|0))|0;while(1){if(u){h=c;k=f}else{k=f+j|0;h=c+j|0;l=j;o=e;n=m;while(1){y=d[n+p>>0]|0;z=d[n+r>>0]|0;A=d[n+g>>0]|0;C=d[n>>0]|0;B=A+y|0;w=d[o+q>>0]|0;a[c+48>>0]=((d[((d[n+q>>0]|0)+16-B-(B<<2)+w+((C+z|0)*20|0)>>5)+3984>>0]|0)+1+(d[f+q>>0]|0)|0)>>>1;B=w+C|0;x=d[o+g>>0]|0;a[c+32>>0]=((d[(A+16-B-(B<<2)+x+((z+y|0)*20|0)>>5)+3984>>0]|0)+1+(d[f+g>>0]|0)|0)>>>1;B=x+z|0;A=d[o>>0]|0;a[c+16>>0]=((d[(C+16-B-(B<<2)+A+((w+y|0)*20|0)>>5)+3984>>0]|0)+1+(d[f>>0]|0)|0)>>>1;y=A+y|0;a[c>>0]=((d[(z+16-y-(y<<2)+(d[o+r>>0]|0)+((x+w|0)*20|0)>>5)+3984>>0]|0)+1+(d[f+r>>0]|0)|0)>>>1;l=l+-1|0;if(!l)break;else{c=c+1|0;o=o+1|0;f=f+1|0;n=n+1|0}}e=e+j|0;m=m+j|0}b=b+-1|0;if(!b)break;else{c=h+t|0;e=e+s|0;f=k+s|0;m=m+s|0}}i=v;return}function Zb(b,c,e,f,g,h,j,k){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;var l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;u=i;i=i+448|0;l=u;if((e|0)>=0?!((e+5+j|0)>>>0>g>>>0|(f|0)<0|(k+f|0)>>>0>h>>>0):0)l=b;else{n=j+5|0;Ub(b,l,e,f,g,h,n,k,n);g=n;e=0;f=0}if(!k){i=u;return}r=j>>>2;t=(r|0)==0;s=g-j|0;q=16-j|0;p=r<<2;b=c;l=l+(e+5+(Z(f,g)|0))|0;o=k;while(1){if(t)h=b;else{h=b+p|0;e=l;g=d[l+-1>>0]|0;k=d[l+-2>>0]|0;m=d[l+-3>>0]|0;n=d[l+-4>>0]|0;j=d[l+-5>>0]|0;c=r;while(1){f=n+g|0;v=n;n=d[e>>0]|0;a[b>>0]=a[(j+16-f-(f<<2)+n+((m+k|0)*20|0)>>5)+3984>>0]|0;j=n+m|0;f=m;m=d[e+1>>0]|0;a[b+1>>0]=a[(v+16-j-(j<<2)+m+((k+g|0)*20|0)>>5)+3984>>0]|0;j=m+k|0;v=k;k=d[e+2>>0]|0;a[b+2>>0]=a[(f+16-j-(j<<2)+k+((n+g|0)*20|0)>>5)+3984>>0]|0;j=k+g|0;f=d[e+3>>0]|0;a[b+3>>0]=a[(v+16-j-(j<<2)+f+((m+n|0)*20|0)>>5)+3984>>0]|0;c=c+-1|0;if(!c)break;else{j=g;b=b+4|0;e=e+4|0;g=f}}l=l+p|0}o=o+-1|0;if(!o)break;else{b=h+q|0;l=l+s|0}}i=u;return}function _b(b,c,e,f,g,h,j,k,l){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0;v=i;i=i+448|0;m=v;if((e|0)>=0?!((e+5+j|0)>>>0>g>>>0|(f|0)<0|(k+f|0)>>>0>h>>>0):0)m=b;else{o=j+5|0;Ub(b,m,e,f,g,h,o,k,o);g=o;e=0;f=0}if(!k){i=v;return}s=j>>>2;u=(s|0)==0;t=g-j|0;r=16-j|0;q=(l|0)!=0;p=s<<2;b=c;m=m+(e+5+(Z(f,g)|0))|0;while(1){if(u)h=b;else{h=b+p|0;l=m;e=d[m+-1>>0]|0;g=d[m+-2>>0]|0;n=d[m+-3>>0]|0;o=d[m+-4>>0]|0;j=d[m+-5>>0]|0;c=s;while(1){f=o+e|0;w=o;o=d[l>>0]|0;a[b>>0]=((q?g:n)+1+(d[(j+16-f-(f<<2)+o+((n+g|0)*20|0)>>5)+3984>>0]|0)|0)>>>1;j=o+n|0;f=n;n=d[l+1>>0]|0;a[b+1>>0]=((q?e:g)+1+(d[(w+16-j-(j<<2)+n+((g+e|0)*20|0)>>5)+3984>>0]|0)|0)>>>1;j=n+g|0;w=g;g=d[l+2>>0]|0;a[b+2>>0]=((q?o:e)+1+(d[(f+16-j-(j<<2)+g+((o+e|0)*20|0)>>5)+3984>>0]|0)|0)>>>1;j=g+e|0;f=d[l+3>>0]|0;a[b+3>>0]=((q?n:o)+1+(d[(w+16-j-(j<<2)+f+((n+o|0)*20|0)>>5)+3984>>0]|0)|0)>>>1;c=c+-1|0;if(!c)break;else{j=e;b=b+4|0;l=l+4|0;e=f}}m=m+p|0}k=k+-1|0;if(!k)break;else{b=h+r|0;m=m+t|0}}i=v;return}function $b(b,c,e,f,g,h,j,k,l){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0;z=i;i=i+448|0;m=z;if(((e|0)>=0?!((e+5+j|0)>>>0>g>>>0|(f|0)<0):0)?(f+5+k|0)>>>0<=h>>>0:0)m=b;else{y=j+5|0;Ub(b,m,e,f,g,h,y,k+5|0,y);g=y;e=0;f=0}b=(Z(f,g)|0)+e|0;y=(l&1|2)+g+b|0;n=m+y|0;if(!k){i=z;return}u=j>>>2;w=(u|0)==0;v=g-j|0;x=16-j|0;t=u<<2;b=m+((Z(g,l>>>1&1|2)|0)+5+b)|0;s=k;while(1){if(!w){r=c+t|0;h=b;e=d[b+-1>>0]|0;f=d[b+-2>>0]|0;o=d[b+-3>>0]|0;p=d[b+-4>>0]|0;l=d[b+-5>>0]|0;q=u;while(1){A=p+e|0;B=p;p=d[h>>0]|0;a[c>>0]=a[(l+16-A-(A<<2)+p+((o+f|0)*20|0)>>5)+3984>>0]|0;A=p+o|0;l=o;o=d[h+1>>0]|0;a[c+1>>0]=a[(B+16-A-(A<<2)+o+((f+e|0)*20|0)>>5)+3984>>0]|0;A=o+f|0;B=f;f=d[h+2>>0]|0;a[c+2>>0]=a[(l+16-A-(A<<2)+f+((p+e|0)*20|0)>>5)+3984>>0]|0;A=f+e|0;l=d[h+3>>0]|0;a[c+3>>0]=a[(B+16-A-(A<<2)+l+((o+p|0)*20|0)>>5)+3984>>0]|0;q=q+-1|0;if(!q)break;else{A=e;c=c+4|0;h=h+4|0;e=l;l=A}}c=r;b=b+t|0}s=s+-1|0;if(!s)break;else{c=c+x|0;b=b+v|0}}b=k>>>2;if(!b){i=z;return}t=(j|0)==0;p=(g<<2)-j|0;o=64-j|0;q=0-g|0;s=q<<1;r=g<<1;c=c+(x-(k<<4))|0;h=m+(y+(g*5|0))|0;l=b;while(1){if(t){b=c;m=n}else{b=c+j|0;m=c;e=n;f=h;c=j;while(1){x=d[f+s>>0]|0;w=d[f+q>>0]|0;u=d[f+g>>0]|0;B=d[f>>0]|0;y=u+x|0;k=d[e+r>>0]|0;A=m+48|0;a[A>>0]=((d[((d[f+r>>0]|0)+16-y-(y<<2)+k+((B+w|0)*20|0)>>5)+3984>>0]|0)+1+(d[A>>0]|0)|0)>>>1;A=k+B|0;y=d[e+g>>0]|0;v=m+32|0;a[v>>0]=((d[(u+16-A-(A<<2)+y+((w+x|0)*20|0)>>5)+3984>>0]|0)+1+(d[v>>0]|0)|0)>>>1;v=d[e>>0]|0;A=y+w|0;u=m+16|0;a[u>>0]=((d[(B+16-A-(A<<2)+v+((k+x|0)*20|0)>>5)+3984>>0]|0)+1+(d[u>>0]|0)|0)>>>1;x=v+x|0;a[m>>0]=((d[(w+16-x-(x<<2)+(d[e+q>>0]|0)+((y+k|0)*20|0)>>5)+3984>>0]|0)+1+(d[m>>0]|0)|0)>>>1;c=c+-1|0;if(!c)break;else{m=m+1|0;e=e+1|0;f=f+1|0}}m=n+j|0;h=h+j|0}l=l+-1|0;if(!l)break;else{c=b+o|0;n=m+p|0;h=h+p|0}}i=z;return}function ac(b,e,f,g,h,j,k,l){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0;x=i;i=i+1792|0;m=x+1344|0;w=x;if(((f|0)>=0?!((f+5+k|0)>>>0>h>>>0|(g|0)<0):0)?(g+5+l|0)>>>0<=j>>>0:0){o=l+5|0;m=b;n=f+5|0}else{n=k+5|0;o=l+5|0;Ub(b,m,f,g,h,j,n,o,n);h=n;n=5;g=0}if(o){t=k>>>2;v=(t|0)==0;s=h-k|0;u=t<<2;f=w;m=m+(n+(Z(g,h)|0))|0;while(1){if(v)b=f;else{b=f+(u<<2)|0;g=m;h=d[m+-1>>0]|0;j=d[m+-2>>0]|0;p=d[m+-3>>0]|0;q=d[m+-4>>0]|0;n=d[m+-5>>0]|0;r=t;while(1){y=q+h|0;z=q;q=d[g>>0]|0;c[f>>2]=n-y-(y<<2)+q+((p+j|0)*20|0);y=q+p|0;n=p;p=d[g+1>>0]|0;c[f+4>>2]=z-y+p-(y<<2)+((j+h|0)*20|0);y=p+j|0;z=j;j=d[g+2>>0]|0;c[f+8>>2]=n-y+j-(y<<2)+((q+h|0)*20|0);y=j+h|0;n=d[g+3>>0]|0;c[f+12>>2]=z-y+n-(y<<2)+((p+q|0)*20|0);r=r+-1|0;if(!r)break;else{y=h;f=f+16|0;g=g+4|0;h=n;n=y}}m=m+u|0}o=o+-1|0;if(!o)break;else{f=b;m=m+s|0}}}h=l>>>2;if(!h){i=x;return}u=(k|0)==0;s=64-k|0;p=k*3|0;t=0-k|0;q=t<<1;r=k<<1;g=e;b=w+(k<<2)|0;m=w+(k*6<<2)|0;o=h;while(1){if(u)h=g;else{h=g+k|0;f=b;j=m;n=k;while(1){e=c[j+(q<<2)>>2]|0;w=c[j+(t<<2)>>2]|0;z=c[j+(k<<2)>>2]|0;A=c[j>>2]|0;y=z+e|0;v=c[f+(r<<2)>>2]|0;a[g+48>>0]=a[((c[j+(r<<2)>>2]|0)+512-y-(y<<2)+v+((A+w|0)*20|0)>>10)+3984>>0]|0;y=v+A|0;l=c[f+(k<<2)>>2]|0;a[g+32>>0]=a[(z+512-y-(y<<2)+l+((w+e|0)*20|0)>>10)+3984>>0]|0;y=c[f>>2]|0;z=l+w|0;a[g+16>>0]=a[(A+512-z-(z<<2)+y+((v+e|0)*20|0)>>10)+3984>>0]|0;e=y+e|0;a[g>>0]=a[(w+512-e-(e<<2)+(c[f+(t<<2)>>2]|0)+((l+v|0)*20|0)>>10)+3984>>0]|0;n=n+-1|0;if(!n)break;else{g=g+1|0;f=f+4|0;j=j+4|0}}b=b+(k<<2)|0;m=m+(k<<2)|0}o=o+-1|0;if(!o)break;else{g=h+s|0;b=b+(p<<2)|0;m=m+(p<<2)|0}}i=x;return}function bc(b,e,f,g,h,j,k,l,m){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;m=m|0;var n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0;y=i;i=i+1792|0;n=y+1344|0;x=y;if(((f|0)>=0?!((f+5+k|0)>>>0>h>>>0|(g|0)<0):0)?(g+5+l|0)>>>0<=j>>>0:0){o=l+5|0;n=b;f=f+5|0}else{q=k+5|0;o=l+5|0;Ub(b,n,f,g,h,j,q,o,q);h=q;f=5;g=0}if(o){v=k>>>2;t=(v|0)==0;u=h-k|0;w=v<<2;p=x;n=n+(f+(Z(g,h)|0))|0;s=o;while(1){if(t)b=p;else{b=p+(w<<2)|0;g=n;f=d[n+-1>>0]|0;h=d[n+-2>>0]|0;j=d[n+-3>>0]|0;q=d[n+-4>>0]|0;o=d[n+-5>>0]|0;r=v;while(1){z=q+f|0;A=q;q=d[g>>0]|0;c[p>>2]=o-z-(z<<2)+q+((j+h|0)*20|0);z=q+j|0;o=j;j=d[g+1>>0]|0;c[p+4>>2]=A-z+j-(z<<2)+((h+f|0)*20|0);z=j+h|0;A=h;h=d[g+2>>0]|0;c[p+8>>2]=o-z+h-(z<<2)+((q+f|0)*20|0);z=h+f|0;o=d[g+3>>0]|0;c[p+12>>2]=A-z+o-(z<<2)+((j+q|0)*20|0);r=r+-1|0;if(!r)break;else{z=f;p=p+16|0;g=g+4|0;f=o;o=z}}n=n+w|0}s=s+-1|0;if(!s)break;else{p=b;n=n+u|0}}}f=l>>>2;if(!f){i=y;return}w=(k|0)==0;u=64-k|0;q=k*3|0;v=0-k|0;t=v<<1;s=k<<1;b=x+(k<<2)|0;n=x+((Z(m+2|0,k)|0)+k<<2)|0;h=x+(k*6<<2)|0;r=f;while(1){if(w){g=e;f=n}else{f=n+(k<<2)|0;g=e+k|0;p=b;j=h;o=k;while(1){m=c[j+(t<<2)>>2]|0;l=c[j+(v<<2)>>2]|0;B=c[j+(k<<2)>>2]|0;C=c[j>>2]|0;A=B+m|0;z=c[p+(s<<2)>>2]|0;a[e+48>>0]=((d[((c[j+(s<<2)>>2]|0)+512-A-(A<<2)+z+((C+l|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[n+(s<<2)>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;A=z+C|0;x=c[p+(k<<2)>>2]|0;a[e+32>>0]=((d[(B+512-A-(A<<2)+x+((l+m|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[n+(k<<2)>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;A=c[p>>2]|0;B=x+l|0;a[e+16>>0]=((d[(C+512-B-(B<<2)+A+((z+m|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[n>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;m=A+m|0;a[e>>0]=((d[(l+512-m-(m<<2)+(c[p+(v<<2)>>2]|0)+((x+z|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[n+(v<<2)>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;o=o+-1|0;if(!o)break;else{e=e+1|0;p=p+4|0;n=n+4|0;j=j+4|0}}b=b+(k<<2)|0;h=h+(k<<2)|0}r=r+-1|0;if(!r)break;else{e=g+u|0;b=b+(q<<2)|0;n=f+(q<<2)|0;h=h+(q<<2)|0}}i=y;return}function cc(b,e,f,g,h,j,k,l,m){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;m=m|0;var n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0;B=i;i=i+1792|0;n=B+1344|0;A=B;z=k+5|0;if(((f|0)>=0?!((f+5+k|0)>>>0>h>>>0|(g|0)<0):0)?(g+5+l|0)>>>0<=j>>>0:0)n=b;else{Ub(b,n,f,g,h,j,z,l+5|0,z);h=z;f=0;g=0}s=f+h+(Z(g,h)|0)|0;g=l>>>2;if(g){y=(z|0)==0;x=(h<<2)-k+-5|0;t=z*3|0;p=0-h|0;w=p<<1;v=h<<1;u=z<<1;q=-5-k|0;j=A+(z<<2)|0;r=n+s|0;f=n+(s+(h*5|0))|0;while(1){if(y)s=j;else{s=j+(z<<2)|0;n=r;b=f;o=z;while(1){E=d[b+w>>0]|0;F=d[b+p>>0]|0;H=d[b+h>>0]|0;I=d[b>>0]|0;G=H+E|0;C=d[n+v>>0]|0;c[j+(u<<2)>>2]=(d[b+v>>0]|0)-G-(G<<2)+C+((I+F|0)*20|0);G=C+I|0;D=d[n+h>>0]|0;c[j+(z<<2)>>2]=H-G+D-(G<<2)+((F+E|0)*20|0);G=d[n>>0]|0;H=D+F|0;c[j>>2]=I-H+G-(H<<2)+((C+E|0)*20|0);E=G+E|0;c[j+(q<<2)>>2]=F-E+(d[n+p>>0]|0)-(E<<2)+((D+C|0)*20|0);o=o+-1|0;if(!o)break;else{j=j+4|0;n=n+1|0;b=b+1|0}}r=r+z|0;f=f+z|0}g=g+-1|0;if(!g)break;else{j=s+(t<<2)|0;r=r+x|0;f=f+x|0}}}if(!l){i=B;return}v=k>>>2;w=(v|0)==0;u=16-k|0;t=v<<2;h=A+(m+2<<2)|0;g=A+20|0;while(1){if(w)f=h;else{f=h+(t<<2)|0;s=e;n=g;j=c[g+-4>>2]|0;o=c[g+-8>>2]|0;p=c[g+-12>>2]|0;q=c[g+-16>>2]|0;b=c[g+-20>>2]|0;r=v;while(1){m=q+j|0;k=q;q=c[n>>2]|0;a[s>>0]=((d[(b+512-m-(m<<2)+q+((p+o|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[h>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;m=q+p|0;b=p;p=c[n+4>>2]|0;a[s+1>>0]=((d[(k+512-m-(m<<2)+p+((o+j|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[h+4>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;m=p+o|0;k=o;o=c[n+8>>2]|0;a[s+2>>0]=((d[(b+512-m-(m<<2)+o+((q+j|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[h+8>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;m=o+j|0;b=c[n+12>>2]|0;a[s+3>>0]=((d[(k+512-m-(m<<2)+b+((p+q|0)*20|0)>>10)+3984>>0]|0)+1+(d[((c[h+12>>2]|0)+16>>5)+3984>>0]|0)|0)>>>1;r=r+-1|0;if(!r)break;else{m=j;s=s+4|0;h=h+16|0;n=n+16|0;j=b;b=m}}e=e+t|0;g=g+(t<<2)|0}l=l+-1|0;if(!l)break;else{e=e+u|0;h=f+20|0;g=g+20|0}}i=B;return}function dc(a,d,e,f,g,h,j,k,l){a=a|0;d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0;x=i;q=a+((j<<4)+h)|0;u=b[d>>1]|0;w=d+2|0;t=b[w>>1]|0;s=e+4|0;p=c[s>>2]<<4;r=e+8|0;o=c[r>>2]<<4;f=h+f|0;m=f+(u>>2)|0;g=j+g|0;n=g+(t>>2)|0;do switch(c[6800+((u&3)<<4)+((t&3)<<2)>>2]|0){case 10:{ac(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l);break}case 6:{cc(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,0);break}case 4:{_b(c[e>>2]|0,q,m+-2|0,n,p,o,k,l,0);break}case 1:{Yb(c[e>>2]|0,q,m,n+-2|0,p,o,k,l,0);break}case 2:{Xb(c[e>>2]|0,q,m,n+-2|0,p,o,k,l);break}case 12:{_b(c[e>>2]|0,q,m+-2|0,n,p,o,k,l,1);break}case 14:{cc(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,1);break}case 7:{$b(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,2);break}case 13:{$b(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,1);break}case 5:{$b(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,0);break}case 0:{Ub(c[e>>2]|0,q,m,n,p,o,k,l,16);break}case 9:{bc(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,0);break}case 8:{Zb(c[e>>2]|0,q,m+-2|0,n,p,o,k,l);break}case 3:{Yb(c[e>>2]|0,q,m,n+-2|0,p,o,k,l,1);break}case 11:{bc(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,1);break}default:$b(c[e>>2]|0,q,m+-2|0,n+-2|0,p,o,k,l,3)}while(0);u=(h>>>1)+256+(j>>>1<<3)|0;v=a+u|0;t=c[e>>2]|0;m=c[s>>2]|0;j=c[r>>2]|0;r=m<<3;s=j<<3;p=b[d>>1]|0;e=(p>>3)+(f>>>1)|0;q=b[w>>1]|0;o=(q>>3)+(g>>>1)|0;p=p&7;q=q&7;g=k>>>1;h=l>>>1;j=Z(m<<8,j)|0;f=t+j|0;m=(p|0)!=0;n=(q|0)!=0;if(m&n){Wb(f,v,e,o,r,s,p,q,g,h);i=x;return}if(m){Tb(f,v,e,o,r,s,p,g,h);i=x;return}if(n){Vb(f,v,e,o,r,s,q,g,h);i=x;return}else{Ub(f,v,e,o,r,s,g,h,8);Ub(t+((Z(s,r)|0)+j)|0,a+(u+64)|0,e,o,r,s,g,h,8);i=x;return}}function ec(b,c,d,e,f){b=b|0;c=c|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0;j=i;if(d){nd(c|0,a[b>>0]|0,d|0)|0;c=c+d|0}if(e){h=c+e|0;g=e;d=b;while(1){a[c>>0]=a[d>>0]|0;g=g+-1|0;if(!g)break;else{c=c+1|0;d=d+1|0}}c=h;b=b+e|0}if(!f){i=j;return}nd(c|0,a[b+-1>>0]|0,f|0)|0;i=j;return}function fc(a,b,c,d,e){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;c=i;hd(b,a,d);i=c;return}function gc(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;q=i;f=c[a+40>>2]|0;if(f){h=c[a>>2]|0;k=a+32|0;j=0;do{if(((c[h+(j*40|0)+20>>2]|0)+-1|0)>>>0<2){g=c[h+(j*40|0)+12>>2]|0;if(g>>>0>d>>>0)g=g-(c[k>>2]|0)|0;c[h+(j*40|0)+8>>2]=g}j=j+1|0}while((j|0)!=(f|0))}if(!(c[b>>2]|0)){p=0;i=q;return p|0}g=c[b+4>>2]|0;if(g>>>0>=3){p=0;i=q;return p|0}o=a+32|0;p=a+24|0;n=a+4|0;f=d;m=0;a:while(1){b:do if(g>>>0<2){k=c[b+(m*12|0)+8>>2]|0;if(!g){g=f-k|0;if((g|0)<0)g=(c[o>>2]|0)+g|0}else{l=k+f|0;g=c[o>>2]|0;g=l-((l|0)<(g|0)?0:g)|0}if(g>>>0>d>>>0)f=g-(c[o>>2]|0)|0;else f=g;j=c[p>>2]|0;if(!j){f=1;g=37;break a}k=c[a>>2]|0;l=0;while(1){h=c[k+(l*40|0)+20>>2]|0;if((h+-1|0)>>>0<2?(c[k+(l*40|0)+8>>2]|0)==(f|0):0){f=g;break b}l=l+1|0;if(l>>>0>=j>>>0){f=1;g=37;break a}}}else{j=c[b+(m*12|0)+12>>2]|0;h=c[p>>2]|0;if(!h){f=1;g=37;break a}k=c[a>>2]|0;g=0;while(1){if((c[k+(g*40|0)+20>>2]|0)==3?(c[k+(g*40|0)+8>>2]|0)==(j|0):0){h=3;l=g;break b}g=g+1|0;if(g>>>0>=h>>>0){f=1;g=37;break a}}}while(0);if(!((l|0)>-1&h>>>0>1)){f=1;g=37;break}if(m>>>0<e>>>0){k=e;do{j=k;k=k+-1|0;h=c[n>>2]|0;c[h+(j<<2)>>2]=c[h+(k<<2)>>2]}while(k>>>0>m>>>0);k=c[a>>2]|0}c[(c[n>>2]|0)+(m<<2)>>2]=k+(l*40|0);m=m+1|0;if(m>>>0<=e>>>0){g=m;k=m;do{j=c[n>>2]|0;h=c[j+(g<<2)>>2]|0;if((h|0)!=((c[a>>2]|0)+(l*40|0)|0)){c[j+(k<<2)>>2]=h;k=k+1|0}g=g+1|0}while(g>>>0<=e>>>0)}g=c[b+(m*12|0)+4>>2]|0;if(g>>>0>=3){f=0;g=37;break}}if((g|0)==37){i=q;return f|0}return 0}function hc(a,b,d,e,f,g,h,j){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0;K=i;I=c[d>>2]|0;J=c[a+8>>2]|0;if((I|0)!=(c[J>>2]|0)){D=1;i=K;return D|0}B=a+52|0;c[B>>2]=0;G=c[a+56>>2]|0;o=(G|0)==0;H=o&1;do if(!b){c[J+20>>2]=0;c[J+12>>2]=e;c[J+8>>2]=e;c[J+16>>2]=f;c[J+24>>2]=H;if(o){d=a+44|0;c[d>>2]=(c[d>>2]|0)+1;d=0;r=0}else{d=G;r=0}}else{if(g){k=a+20|0;c[k>>2]=0;l=a+16|0;c[l>>2]=0;r=c[a>>2]|0;s=a+44|0;q=0;do{p=r+(q*40|0)+20|0;if((c[p>>2]|0)!=0?(c[p>>2]=0,(c[r+(q*40|0)+24>>2]|0)==0):0)c[s>>2]=(c[s>>2]|0)+-1;q=q+1|0}while((q|0)!=16);a:do if(o){n=c[a+28>>2]|0;m=a+12|0;q=0;while(1){e=0;p=2147483647;o=0;do{if(c[r+(e*40|0)+24>>2]|0){C=c[r+(e*40|0)+16>>2]|0;D=(C|0)<(p|0);p=D?C:p;o=D?r+(e*40|0)|0:o}e=e+1|0}while(e>>>0<=n>>>0);if(!o){d=0;break a}D=c[m>>2]|0;c[D+(q<<4)>>2]=c[o>>2];c[D+(q<<4)+12>>2]=c[o+36>>2];c[D+(q<<4)+4>>2]=c[o+28>>2];c[D+(q<<4)+8>>2]=c[o+32>>2];q=q+1|0;c[l>>2]=q;c[o+24>>2]=0;if(c[o+20>>2]|0)continue;c[s>>2]=(c[s>>2]|0)+-1}}else d=G;while(0);p=a+40|0;c[p>>2]=0;o=a+36|0;c[o>>2]=65535;c[a+48>>2]=0;if(!(c[b>>2]|d))d=0;else{c[l>>2]=0;c[k>>2]=0}r=(c[b+4>>2]|0)==0;c[J+20>>2]=r?2:3;c[o>>2]=r?65535:0;c[J+12>>2]=0;c[J+8>>2]=0;c[J+16>>2]=0;c[J+24>>2]=H;c[s>>2]=1;c[p>>2]=1;r=0;break}if(!(c[b+8>>2]|0)){d=a+40|0;q=c[d>>2]|0;p=c[a+24>>2]|0;if(q>>>0>=p>>>0)if(q){l=c[a>>2]|0;m=0;o=-1;n=0;do{if(((c[l+(m*40|0)+20>>2]|0)+-1|0)>>>0<2){D=c[l+(m*40|0)+8>>2]|0;C=(D|0)<(n|0)|(o|0)==-1;o=C?m:o;n=C?D:n}m=m+1|0}while((m|0)!=(q|0));if((o|0)>-1){q=q+-1|0;c[l+(o*40|0)+20>>2]=0;c[d>>2]=q;if(!(c[l+(o*40|0)+24>>2]|0)){d=a+44|0;c[d>>2]=(c[d>>2]|0)+-1;d=G;n=0}else{d=G;n=0}}else{d=G;n=1}}else{q=0;d=G;n=1}else{d=G;n=0}}else{E=a+24|0;C=a+40|0;v=a+44|0;x=a+36|0;A=a+48|0;u=a+28|0;y=a+16|0;z=a+12|0;r=G;d=G;t=0;w=0;b:while(1){switch(c[b+(t*20|0)+12>>2]|0){case 4:{l=c[b+(t*20|0)+28>>2]|0;c[x>>2]=l;m=c[E>>2]|0;if(!m)s=w;else{n=c[a>>2]|0;s=l;o=0;do{k=n+(o*40|0)+20|0;do if((c[k>>2]|0)==3){if((c[n+(o*40|0)+8>>2]|0)>>>0<=l>>>0)if((s|0)==65535)s=65535;else break;c[k>>2]=0;c[C>>2]=(c[C>>2]|0)+-1;if(!(c[n+(o*40|0)+24>>2]|0))c[v>>2]=(c[v>>2]|0)+-1}while(0);o=o+1|0}while((o|0)!=(m|0));s=w}break}case 1:{n=e-(c[b+(t*20|0)+16>>2]|0)|0;l=c[E>>2]|0;if(!l){n=1;break b}m=c[a>>2]|0;s=0;while(1){k=m+(s*40|0)+20|0;if(((c[k>>2]|0)+-1|0)>>>0<2?(c[m+(s*40|0)+8>>2]|0)==(n|0):0)break;s=s+1|0;if(s>>>0>=l>>>0){n=1;break b}}if((s|0)<0){n=1;break b}c[k>>2]=0;c[C>>2]=(c[C>>2]|0)+-1;if(!(c[m+(s*40|0)+24>>2]|0)){c[v>>2]=(c[v>>2]|0)+-1;s=w}else s=w;break}case 6:{m=c[b+(t*20|0)+24>>2]|0;s=c[x>>2]|0;if((s|0)==65535|s>>>0<m>>>0){n=1;F=101;break b}r=c[E>>2]|0;c:do if(r){l=c[a>>2]|0;s=0;while(1){k=l+(s*40|0)+20|0;if((c[k>>2]|0)==3?(c[l+(s*40|0)+8>>2]|0)==(m|0):0)break;s=s+1|0;if(s>>>0>=r>>>0){F=88;break c}}c[k>>2]=0;k=(c[C>>2]|0)+-1|0;c[C>>2]=k;if(!(c[l+(s*40|0)+24>>2]|0)){c[v>>2]=(c[v>>2]|0)+-1;s=k}else s=k}else{r=0;F=88}while(0);if((F|0)==88){F=0;s=c[C>>2]|0}if(s>>>0>=r>>>0){n=1;F=101;break b}c[J+12>>2]=e;c[J+8>>2]=m;c[J+16>>2]=f;c[J+20>>2]=3;c[J+24>>2]=H;c[C>>2]=s+1;c[v>>2]=(c[v>>2]|0)+1;r=G;d=G;s=1;break}case 2:{l=c[b+(t*20|0)+20>>2]|0;m=c[E>>2]|0;if(!m){n=1;break b}n=c[a>>2]|0;s=0;while(1){k=n+(s*40|0)+20|0;if((c[k>>2]|0)==3?(c[n+(s*40|0)+8>>2]|0)==(l|0):0)break;s=s+1|0;if(s>>>0>=m>>>0){n=1;break b}}if((s|0)<0){n=1;break b}c[k>>2]=0;c[C>>2]=(c[C>>2]|0)+-1;if(!(c[n+(s*40|0)+24>>2]|0)){c[v>>2]=(c[v>>2]|0)+-1;s=w}else s=w;break}case 3:{s=c[b+(t*20|0)+16>>2]|0;n=c[b+(t*20|0)+24>>2]|0;k=c[x>>2]|0;if((k|0)==65535|k>>>0<n>>>0){n=1;break b}o=c[E>>2]|0;if(!o){n=1;break b}p=c[a>>2]|0;k=0;while(1){m=p+(k*40|0)+20|0;if((c[m>>2]|0)==3?(c[p+(k*40|0)+8>>2]|0)==(n|0):0){F=47;break}l=k+1|0;if(l>>>0<o>>>0)k=l;else break}if((F|0)==47?(F=0,c[m>>2]=0,c[C>>2]=(c[C>>2]|0)+-1,(c[p+(k*40|0)+24>>2]|0)==0):0)c[v>>2]=(c[v>>2]|0)+-1;m=e-s|0;s=0;while(1){l=p+(s*40|0)+20|0;k=c[l>>2]|0;if((k+-1|0)>>>0<2?(D=p+(s*40|0)+8|0,(c[D>>2]|0)==(m|0)):0)break;s=s+1|0;if(s>>>0>=o>>>0){n=1;break b}}if(!((s|0)>-1&k>>>0>1)){n=1;break b}c[l>>2]=3;c[D>>2]=n;s=w;break}case 5:{n=c[a>>2]|0;q=0;do{p=n+(q*40|0)+20|0;if((c[p>>2]|0)!=0?(c[p>>2]=0,(c[n+(q*40|0)+24>>2]|0)==0):0)c[v>>2]=(c[v>>2]|0)+-1;q=q+1|0}while((q|0)!=16);d:do if(!d){l=c[u>>2]|0;m=r;while(1){d=0;s=2147483647;k=0;do{if(c[n+(d*40|0)+24>>2]|0){o=c[n+(d*40|0)+16>>2]|0;e=(o|0)<(s|0);s=e?o:s;k=e?n+(d*40|0)|0:k}d=d+1|0}while(d>>>0<=l>>>0);if(!k){r=m;d=0;break d}s=c[y>>2]|0;d=c[z>>2]|0;c[d+(s<<4)>>2]=c[k>>2];c[d+(s<<4)+12>>2]=c[k+36>>2];c[d+(s<<4)+4>>2]=c[k+28>>2];c[d+(s<<4)+8>>2]=c[k+32>>2];c[y>>2]=s+1;c[k+24>>2]=0;if(!(c[k+20>>2]|0))c[v>>2]=(c[v>>2]|0)+-1;if(!m)m=0;else{r=m;d=m;break}}}while(0);c[C>>2]=0;c[x>>2]=65535;c[A>>2]=0;c[B>>2]=1;e=0;s=w;break}case 0:{n=0;F=101;break b}default:{n=1;break b}}t=t+1|0;w=s}if(w){r=n;break}q=c[C>>2]|0;p=c[E>>2]|0}if(q>>>0<p>>>0){c[J+12>>2]=e;c[J+8>>2]=e;c[J+16>>2]=f;c[J+20>>2]=2;c[J+24>>2]=H;r=a+44|0;c[r>>2]=(c[r>>2]|0)+1;c[a+40>>2]=q+1;r=n}else r=1}while(0);c[J+36>>2]=g;c[J+28>>2]=h;c[J+32>>2]=j;if(!d){o=a+44|0;d=c[o>>2]|0;k=c[a+28>>2]|0;if(d>>>0>k>>>0){p=a+16|0;q=a+12|0;do{n=c[a>>2]|0;e=0;l=2147483647;m=0;do{if(c[n+(e*40|0)+24>>2]|0){C=c[n+(e*40|0)+16>>2]|0;D=(C|0)<(l|0);l=D?C:l;m=D?n+(e*40|0)|0:m}e=e+1|0}while(e>>>0<=k>>>0);if((m|0)!=0?(D=c[p>>2]|0,C=c[q>>2]|0,c[C+(D<<4)>>2]=c[m>>2],c[C+(D<<4)+12>>2]=c[m+36>>2],c[C+(D<<4)+4>>2]=c[m+28>>2],c[C+(D<<4)+8>>2]=c[m+32>>2],c[p>>2]=D+1,c[m+24>>2]=0,(c[m+20>>2]|0)==0):0){d=d+-1|0;c[o>>2]=d}}while(d>>>0>k>>>0)}}else{k=a+16|0;D=c[k>>2]|0;C=c[a+12>>2]|0;c[C+(D<<4)>>2]=I;c[C+(D<<4)+12>>2]=g;c[C+(D<<4)+4>>2]=h;c[C+(D<<4)+8>>2]=j;c[k>>2]=D+1;k=c[a+28>>2]|0}rc(c[a>>2]|0,k+1|0);D=r;i=K;return D|0}function ic(a,b){a=a|0;b=b|0;var d=0,e=0;e=i;if((b>>>0<=16?(d=c[(c[a+4>>2]|0)+(b<<2)>>2]|0,(d|0)!=0):0)?(c[d+20>>2]|0)>>>0>1:0)d=c[d>>2]|0;else d=0;i=e;return d|0}function jc(a){a=a|0;var b=0;b=(c[a>>2]|0)+((c[a+28>>2]|0)*40|0)|0;c[a+8>>2]=b;return c[b>>2]|0}function kc(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,j=0;j=i;c[a+36>>2]=65535;e=e>>>0>1?e:1;c[a+24>>2]=e;h=a+28|0;c[h>>2]=(g|0)==0?d:e;c[a+32>>2]=f;c[a+56>>2]=g;c[a+44>>2]=0;c[a+40>>2]=0;c[a+48>>2]=0;g=fd(680)|0;c[a>>2]=g;if(!g){g=65535;i=j;return g|0}id(g,0,680);a:do if((c[h>>2]|0)!=-1){f=b*384|47;e=0;while(1){d=fd(f)|0;g=c[a>>2]|0;c[g+(e*40|0)+4>>2]=d;if(!d){g=65535;break}c[g+(e*40|0)>>2]=d+(0-d&15);e=e+1|0;if(e>>>0>=((c[h>>2]|0)+1|0)>>>0)break a}i=j;return g|0}while(0);g=a+4|0;c[g>>2]=fd(68)|0;f=fd((c[h>>2]<<4)+16|0)|0;c[a+12>>2]=f;g=c[g>>2]|0;if((g|0)==0|(f|0)==0){g=65535;i=j;return g|0}id(g,0,68);c[a+20>>2]=0;c[a+16>>2]=0;g=0;i=j;return g|0}function lc(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0;l=i;h=c[a>>2]|0;if(h){k=a+28|0;if((c[k>>2]|0)!=-1){j=0;do{gd(c[h+(j*40|0)+4>>2]|0);h=c[a>>2]|0;c[h+(j*40|0)+4>>2]=0;j=j+1|0}while(j>>>0<((c[k>>2]|0)+1|0)>>>0)}}else h=0;gd(h);c[a>>2]=0;h=a+4|0;gd(c[h>>2]|0);c[h>>2]=0;h=a+12|0;gd(c[h>>2]|0);c[h>>2]=0;h=kc(a,b,d,e,f,g)|0;i=l;return h|0}function mc(a){a=a|0;var b=0,d=0,e=0,f=0;f=i;b=c[a>>2]|0;if(b){e=a+28|0;if((c[e>>2]|0)!=-1){d=0;do{gd(c[b+(d*40|0)+4>>2]|0);b=c[a>>2]|0;c[b+(d*40|0)+4>>2]=0;d=d+1|0}while(d>>>0<((c[e>>2]|0)+1|0)>>>0)}}else b=0;gd(b);c[a>>2]=0;b=a+4|0;gd(c[b>>2]|0);c[b>>2]=0;b=a+12|0;gd(c[b>>2]|0);c[b>>2]=0;i=f;return}function nc(a){a=a|0;var b=0,d=0,e=0,f=0;f=i;b=c[a+40>>2]|0;if(!b){i=f;return}e=a+4|0;d=0;do{c[(c[e>>2]|0)+(d<<2)>>2]=(c[a>>2]|0)+(d*40|0);d=d+1|0}while(d>>>0<b>>>0);i=f;return}function oc(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0;y=i;v=a+16|0;c[v>>2]=0;c[a+20>>2]=0;if(!e){b=0;i=y;return b|0}x=a+48|0;e=c[x>>2]|0;f=(e|0)==(b|0);a:do if(!f?(u=a+32|0,l=c[u>>2]|0,k=((e+1|0)>>>0)%(l>>>0)|0,(k|0)!=(b|0)):0){t=a+28|0;w=c[(c[a>>2]|0)+((c[t>>2]|0)*40|0)>>2]|0;r=a+40|0;p=a+24|0;o=a+44|0;q=a+56|0;s=a+12|0;n=k;while(1){k=c[r>>2]|0;if(!k)k=0;else{j=c[a>>2]|0;h=0;do{if(((c[j+(h*40|0)+20>>2]|0)+-1|0)>>>0<2){e=c[j+(h*40|0)+12>>2]|0;c[j+(h*40|0)+8>>2]=e-(e>>>0>n>>>0?l:0)}h=h+1|0}while((h|0)!=(k|0))}if(k>>>0>=(c[p>>2]|0)>>>0){if(!k){e=1;g=46;break}f=c[a>>2]|0;h=0;l=-1;j=0;while(1){if(((c[f+(h*40|0)+20>>2]|0)+-1|0)>>>0<2){e=c[f+(h*40|0)+8>>2]|0;m=(e|0)<(j|0)|(l|0)==-1;g=m?h:l;j=m?e:j}else g=l;h=h+1|0;if((h|0)==(k|0))break;else l=g}if((g|0)<=-1){e=1;g=46;break}l=k+-1|0;c[f+(g*40|0)+20>>2]=0;c[r>>2]=l;if(!(c[f+(g*40|0)+24>>2]|0)){c[o>>2]=(c[o>>2]|0)+-1;k=l}else k=l}l=c[o>>2]|0;m=c[t>>2]|0;if(l>>>0>=m>>>0){e=(c[q>>2]|0)==0;do if(e){g=c[a>>2]|0;f=0;j=2147483647;h=0;do{if(c[g+(f*40|0)+24>>2]|0){A=c[g+(f*40|0)+16>>2]|0;z=(A|0)<(j|0);j=z?A:j;h=z?g+(f*40|0)|0:h}f=f+1|0}while(f>>>0<=m>>>0);if((h|0)!=0?(f=c[v>>2]|0,g=c[s>>2]|0,c[g+(f<<4)>>2]=c[h>>2],c[g+(f<<4)+12>>2]=c[h+36>>2],c[g+(f<<4)+4>>2]=c[h+28>>2],c[g+(f<<4)+8>>2]=c[h+32>>2],c[v>>2]=f+1,c[h+24>>2]=0,(c[h+20>>2]|0)==0):0){l=l+-1|0;c[o>>2]=l}}while(l>>>0>=m>>>0)}e=c[a>>2]|0;c[e+(m*40|0)+20>>2]=1;c[e+(m*40|0)+12>>2]=n;c[e+(m*40|0)+8>>2]=n;c[e+(m*40|0)+16>>2]=0;c[e+(m*40|0)+24>>2]=0;c[o>>2]=l+1;c[r>>2]=k+1;rc(e,m+1|0);l=c[u>>2]|0;n=((n+1|0)>>>0)%(l>>>0)|0;if((n|0)==(b|0)){g=31;break}}if((g|0)==31){g=c[v>>2]|0;if(!g){g=41;break}e=c[s>>2]|0;h=c[t>>2]|0;j=c[a>>2]|0;l=j+(h*40|0)|0;k=c[l>>2]|0;f=0;while(1){if((c[e+(f<<4)>>2]|0)==(k|0))break;f=f+1|0;if(f>>>0>=g>>>0){g=41;break a}}if(!h){g=41;break}else e=0;while(1){f=j+(e*40|0)|0;e=e+1|0;if((c[f>>2]|0)==(w|0))break;if(e>>>0>=h>>>0){g=41;break a}}c[f>>2]=k;c[l>>2]=w;g=41;break}else if((g|0)==46){i=y;return e|0}}else g=39;while(0);if((g|0)==39)if(d)if(f){b=1;i=y;return b|0}else g=41;do if((g|0)==41){if(!d){e=c[x>>2]|0;break}c[x>>2]=b;b=0;i=y;return b|0}while(0);if((e|0)==(b|0)){b=0;i=y;return b|0}a=c[a+32>>2]|0;c[x>>2]=((b+-1+a|0)>>>0)%(a>>>0)|0;b=0;i=y;return b|0}function pc(a){a=a|0;var b=0,d=0,e=0;e=i;d=a+20|0;b=c[d>>2]|0;if(b>>>0>=(c[a+16>>2]|0)>>>0){b=0;i=e;return b|0}a=c[a+12>>2]|0;c[d>>2]=b+1;b=a+(b<<4)|0;i=e;return b|0}function qc(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0;k=i;f=c[a>>2]|0;if(!f){i=k;return}c[a+60>>2]=1;if(c[a+56>>2]|0){i=k;return}g=c[a+28>>2]|0;h=a+16|0;j=a+12|0;e=a+44|0;a=0;b=2147483647;d=0;while(1){if(c[f+(a*40|0)+24>>2]|0){m=c[f+(a*40|0)+16>>2]|0;l=(m|0)<(b|0);b=l?m:b;d=l?f+(a*40|0)|0:d}a=a+1|0;if(a>>>0<=g>>>0)continue;if(!d)break;l=c[h>>2]|0;b=c[j>>2]|0;c[b+(l<<4)>>2]=c[d>>2];c[b+(l<<4)+12>>2]=c[d+36>>2];c[b+(l<<4)+4>>2]=c[d+28>>2];c[b+(l<<4)+8>>2]=c[d+32>>2];c[h>>2]=l+1;c[d+24>>2]=0;if(c[d+20>>2]|0){a=0;b=2147483647;d=0;continue}c[e>>2]=(c[e>>2]|0)+-1;a=0;b=2147483647;d=0}i=k;return}function rc(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;v=i;i=i+32|0;q=v+16|0;t=v;o=7;do{if(o>>>0<b>>>0){n=o;do{m=a+(n*40|0)|0;l=c[m>>2]|0;m=c[m+4>>2]|0;p=c[a+(n*40|0)+8>>2]|0;k=a+(n*40|0)+12|0;s=c[k+4>>2]|0;r=q;c[r>>2]=c[k>>2];c[r+4>>2]=s;r=c[a+(n*40|0)+20>>2]|0;s=c[a+(n*40|0)+24>>2]|0;k=a+(n*40|0)+28|0;c[t+0>>2]=c[k+0>>2];c[t+4>>2]=c[k+4>>2];c[t+8>>2]=c[k+8>>2];a:do if(n>>>0<o>>>0){d=n;u=8}else{f=(s|0)==0;j=r+-1|0;k=j>>>0<2;b:do if(!r){e=n;while(1){d=e-o|0;if(c[a+(d*40|0)+20>>2]|0){d=e;break b}if((c[a+(d*40|0)+24>>2]|0)!=0|f){d=e;break b}e=a+(e*40|0)+0|0;g=a+(d*40|0)+0|0;h=e+40|0;do{c[e>>2]=c[g>>2];e=e+4|0;g=g+4|0}while((e|0)<(h|0));if(d>>>0<o>>>0){u=8;break a}else e=d}}else{d=n;while(1){f=d-o|0;e=c[a+(f*40|0)+20>>2]|0;do if(e){e=e+-1|0;if((e|j)>>>0<2){e=c[a+(f*40|0)+8>>2]|0;if((e|0)>(p|0))break b;d=a+(d*40|0)|0;if((e|0)<(p|0))break;else break a}if(e>>>0<2)break b;if(!k?(c[a+(f*40|0)+8>>2]|0)<=(p|0):0)break b;else u=16}else u=16;while(0);if((u|0)==16){u=0;d=a+(d*40|0)|0}e=d+0|0;g=a+(f*40|0)+0|0;h=e+40|0;do{c[e>>2]=c[g>>2];e=e+4|0;g=g+4|0}while((e|0)<(h|0));if(f>>>0<o>>>0){d=f;u=8;break a}else d=f}}while(0);d=a+(d*40|0)|0}while(0);if((u|0)==8){u=0;d=a+(d*40|0)|0}k=d;c[k>>2]=l;c[k+4>>2]=m;c[d+8>>2]=p;k=q;l=c[k+4>>2]|0;m=d+12|0;c[m>>2]=c[k>>2];c[m+4>>2]=l;c[d+20>>2]=r;c[d+24>>2]=s;m=d+28|0;c[m+0>>2]=c[t+0>>2];c[m+4>>2]=c[t+4>>2];c[m+8>>2]=c[t+8>>2];n=n+1|0}while((n|0)!=(b|0))}o=o>>>1}while((o|0)!=0);i=v;return}function sc(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0;l=i;e=c[a+4>>2]|0;f=c[a+16>>2]|0;g=c[a+20>>2]|0;j=e<<2;k=b+256|0;h=16;a=c[a+12>>2]|0;d=b;while(1){m=c[d+4>>2]|0;c[a>>2]=c[d>>2];c[a+4>>2]=m;m=c[d+12>>2]|0;c[a+8>>2]=c[d+8>>2];c[a+12>>2]=m;h=h+-1|0;if(!h)break;else{a=a+(j<<2)|0;d=d+16|0}}j=e<<1&2147483646;h=c[b+260>>2]|0;c[f>>2]=c[k>>2];c[f+4>>2]=h;k=c[b+268>>2]|0;c[f+(j<<2)>>2]=c[b+264>>2];c[f+((j|1)<<2)>>2]=k;k=e<<2;h=c[b+276>>2]|0;c[f+(k<<2)>>2]=c[b+272>>2];c[f+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+284>>2]|0;c[f+(k<<2)>>2]=c[b+280>>2];c[f+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+292>>2]|0;c[f+(k<<2)>>2]=c[b+288>>2];c[f+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+300>>2]|0;c[f+(k<<2)>>2]=c[b+296>>2];c[f+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+308>>2]|0;c[f+(k<<2)>>2]=c[b+304>>2];c[f+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+316>>2]|0;c[f+(k<<2)>>2]=c[b+312>>2];c[f+((k|1)<<2)>>2]=h;k=c[b+324>>2]|0;c[g>>2]=c[b+320>>2];c[g+4>>2]=k;k=c[b+332>>2]|0;c[g+(j<<2)>>2]=c[b+328>>2];c[g+((j|1)<<2)>>2]=k;k=e<<2;h=c[b+340>>2]|0;c[g+(k<<2)>>2]=c[b+336>>2];c[g+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+348>>2]|0;c[g+(k<<2)>>2]=c[b+344>>2];c[g+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+356>>2]|0;c[g+(k<<2)>>2]=c[b+352>>2];c[g+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+364>>2]|0;c[g+(k<<2)>>2]=c[b+360>>2];c[g+((k|1)<<2)>>2]=h;k=k+j|0;h=c[b+372>>2]|0;c[g+(k<<2)>>2]=c[b+368>>2];c[g+((k|1)<<2)>>2]=h;k=k+j|0;j=c[b+380>>2]|0;c[g+(k<<2)>>2]=c[b+376>>2];c[g+((k|1)<<2)>>2]=j;i=l;return}function tc(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0;y=i;r=c[b+4>>2]|0;s=Z(c[b+8>>2]|0,r)|0;w=(e>>>0)%(r>>>0)|0;x=c[b>>2]|0;u=e-w|0;b=(u<<8)+(w<<4)|0;v=s<<8;w=w<<3;p=r<<4;o=r<<2&1073741820;l=o<<1;m=l+o|0;n=0;do{k=c[3344+(n<<2)>>2]|0;j=c[3408+(n<<2)>>2]|0;e=(j<<4)+k|0;h=f+e|0;j=b+k+(Z(j,p)|0)|0;k=x+j|0;q=c[g+(n<<6)>>2]|0;if((q|0)==16777215){j=c[f+(e+16)>>2]|0;c[k>>2]=c[h>>2];c[k+(o<<2)>>2]=j;j=c[f+(e+48)>>2]|0;c[k+(l<<2)>>2]=c[f+(e+32)>>2];c[k+(m<<2)>>2]=j}else{A=d[f+(e+1)>>0]|0;z=c[g+(n<<6)+4>>2]|0;a[k>>0]=a[3472+(q+512+(d[h>>0]|0))>>0]|0;q=d[f+(e+2)>>0]|0;t=c[g+(n<<6)+8>>2]|0;a[x+(j+1)>>0]=a[3472+((A|512)+z)>>0]|0;k=d[f+(e+3)>>0]|0;h=c[g+(n<<6)+12>>2]|0;a[x+(j+2)>>0]=a[3472+(t+512+q)>>0]|0;a[x+(j+3)>>0]=a[3472+(h+512+k)>>0]|0;k=j+p|0;h=d[f+(e+17)>>0]|0;j=c[g+(n<<6)+20>>2]|0;a[x+k>>0]=a[3472+((c[g+(n<<6)+16>>2]|0)+512+(d[f+(e+16)>>0]|0))>>0]|0;q=d[f+(e+18)>>0]|0;t=c[g+(n<<6)+24>>2]|0;a[x+(k+1)>>0]=a[3472+((h|512)+j)>>0]|0;j=d[f+(e+19)>>0]|0;h=c[g+(n<<6)+28>>2]|0;a[x+(k+2)>>0]=a[3472+(t+512+q)>>0]|0;a[x+(k+3)>>0]=a[3472+(h+512+j)>>0]|0;k=k+p|0;j=d[f+(e+33)>>0]|0;h=c[g+(n<<6)+36>>2]|0;a[x+k>>0]=a[3472+((c[g+(n<<6)+32>>2]|0)+512+(d[f+(e+32)>>0]|0))>>0]|0;q=d[f+(e+34)>>0]|0;t=c[g+(n<<6)+40>>2]|0;a[x+(k+1)>>0]=a[3472+((j|512)+h)>>0]|0;h=d[f+(e+35)>>0]|0;j=c[g+(n<<6)+44>>2]|0;a[x+(k+2)>>0]=a[3472+(t+512+q)>>0]|0;a[x+(k+3)>>0]=a[3472+(j+512+h)>>0]|0;k=k+p|0;h=d[f+(e+49)>>0]|0;j=c[g+(n<<6)+52>>2]|0;a[x+k>>0]=a[3472+((c[g+(n<<6)+48>>2]|0)+512+(d[f+(e+48)>>0]|0))>>0]|0;q=d[f+(e+50)>>0]|0;t=c[g+(n<<6)+56>>2]|0;a[x+(k+1)>>0]=a[3472+((h|512)+j)>>0]|0;j=d[f+(e+51)>>0]|0;h=c[g+(n<<6)+60>>2]|0;a[x+(k+2)>>0]=a[3472+(t+512+q)>>0]|0;a[x+(k+3)>>0]=a[3472+(h+512+j)>>0]|0}n=n+1|0}while((n|0)!=16);t=s<<6;s=r<<3&2147483640;r=f+256|0;f=f+320|0;l=w+v+(u<<6)|0;p=s>>>2;j=s>>>1;k=j+p|0;o=16;do{q=o&3;h=c[3344+(q<<2)>>2]|0;q=c[3408+(q<<2)>>2]|0;e=o>>>0>19;m=e?f:r;n=(q<<3)+h|0;b=m+n|0;q=l+(e?t:0)+h+(Z(q,s)|0)|0;h=x+q|0;e=c[g+(o<<6)>>2]|0;if((e|0)==16777215){z=c[m+(n+8)>>2]|0;c[h>>2]=c[b>>2];c[h+(p<<2)>>2]=z;z=c[m+(n+24)>>2]|0;c[h+(j<<2)>>2]=c[m+(n+16)>>2];c[h+(k<<2)>>2]=z}else{v=d[m+(n+1)>>0]|0;z=c[g+(o<<6)+4>>2]|0;a[h>>0]=a[3472+(e+512+(d[b>>0]|0))>>0]|0;w=d[m+(n+2)>>0]|0;u=c[g+(o<<6)+8>>2]|0;a[x+(q+1)>>0]=a[3472+((v|512)+z)>>0]|0;z=d[m+(n+3)>>0]|0;v=c[g+(o<<6)+12>>2]|0;a[x+(q+2)>>0]=a[3472+(u+512+w)>>0]|0;a[x+(q+3)>>0]=a[3472+(v+512+z)>>0]|0;z=q+s|0;v=d[m+(n+9)>>0]|0;w=c[g+(o<<6)+20>>2]|0;a[x+z>>0]=a[3472+((c[g+(o<<6)+16>>2]|0)+512+(d[m+(n+8)>>0]|0))>>0]|0;u=d[m+(n+10)>>0]|0;q=c[g+(o<<6)+24>>2]|0;a[x+(z+1)>>0]=a[3472+((v|512)+w)>>0]|0;w=d[m+(n+11)>>0]|0;v=c[g+(o<<6)+28>>2]|0;a[x+(z+2)>>0]=a[3472+(q+512+u)>>0]|0;a[x+(z+3)>>0]=a[3472+(v+512+w)>>0]|0;z=z+s|0;w=d[m+(n+17)>>0]|0;v=c[g+(o<<6)+36>>2]|0;a[x+z>>0]=a[3472+((c[g+(o<<6)+32>>2]|0)+512+(d[m+(n+16)>>0]|0))>>0]|0;u=d[m+(n+18)>>0]|0;q=c[g+(o<<6)+40>>2]|0;a[x+(z+1)>>0]=a[3472+((w|512)+v)>>0]|0;v=d[m+(n+19)>>0]|0;w=c[g+(o<<6)+44>>2]|0;a[x+(z+2)>>0]=a[3472+(q+512+u)>>0]|0;a[x+(z+3)>>0]=a[3472+(w+512+v)>>0]|0;z=z+s|0;v=d[m+(n+25)>>0]|0;w=c[g+(o<<6)+52>>2]|0;a[x+z>>0]=a[3472+((c[g+(o<<6)+48>>2]|0)+512+(d[m+(n+24)>>0]|0))>>0]|0;u=d[m+(n+26)>>0]|0;q=c[g+(o<<6)+56>>2]|0;a[x+(z+1)>>0]=a[3472+((v|512)+w)>>0]|0;w=d[m+(n+27)>>0]|0;v=c[g+(o<<6)+60>>2]|0;a[x+(z+2)>>0]=a[3472+(q+512+u)>>0]|0;a[x+(z+3)>>0]=a[3472+(v+512+w)>>0]|0}o=o+1|0}while((o|0)!=24);i=y;return}function uc(e,f){e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0,O=0,P=0,Q=0,R=0,S=0,T=0,U=0,V=0,W=0,X=0,Y=0,_=0,$=0,aa=0,ba=0,ca=0,da=0,ea=0,fa=0,ga=0,ha=0,ia=0,ja=0,ka=0,la=0,ma=0,na=0,oa=0,pa=0,qa=0,ra=0,sa=0,ta=0,ua=0,va=0,wa=0,xa=0,ya=0,za=0,Aa=0,Ba=0,Ca=0,Da=0,Ea=0,Fa=0,Ga=0,Ha=0,Ia=0,Ja=0,Ka=0,La=0,Ma=0,Na=0,Pa=0,Qa=0,Ra=0,Sa=0,Ta=0,Ua=0,Va=0,Wa=0,Xa=0,Ya=0,Za=0,_a=0,$a=0,ab=0,bb=0;bb=i;i=i+176|0;ia=bb+40|0;La=bb;ea=c[e+4>>2]|0;ka=e+8|0;Wa=c[ka>>2]|0;g=Z(Wa,ea)|0;if(!Wa){i=bb;return}Za=ia+24|0;_a=ia+16|0;$a=ia+8|0;la=ia+100|0;ma=ia+68|0;na=ia+36|0;oa=ia+4|0;Ma=ia+120|0;Na=ia+112|0;Pa=ia+104|0;Qa=ia+96|0;Ra=ia+88|0;Sa=ia+80|0;Ta=ia+72|0;Ua=ia+64|0;Va=ia+56|0;Wa=ia+48|0;Xa=ia+40|0;Ya=ia+32|0;pa=ia+124|0;qa=ia+116|0;ra=ia+108|0;sa=ia+92|0;ta=ia+84|0;ua=ia+76|0;va=ia+60|0;wa=ia+52|0;xa=ia+44|0;ya=ia+28|0;za=ia+20|0;Aa=ia+12|0;ha=La+28|0;ja=La+32|0;Ka=La+24|0;Da=ea<<4;Ja=0-Da|0;Ca=Ja<<1;Ha=Z(ea,-48)|0;Ia=ea<<5;Ea=Ja<<2;Ga=ea*48|0;Ba=ea<<6;ga=La+24|0;fa=La+12|0;Fa=g<<8;ba=g<<6;ca=ea<<3;W=Da|4;Y=La+16|0;$=La+20|0;da=La+12|0;X=La+4|0;_=La+8|0;U=0;aa=0;V=f;while(1){f=c[V+8>>2]|0;do if((f|0)!=1){T=V+200|0;n=c[T>>2]|0;do if(!n)g=1;else{if((f|0)==2?(c[V+4>>2]|0)!=(c[n+4>>2]|0):0){g=1;break}g=5}while(0);S=V+204|0;l=c[S>>2]|0;do if(l){if((f|0)==2?(c[V+4>>2]|0)!=(c[l+4>>2]|0):0)break;g=g|2}while(0);R=(g&2|0)==0;do if(R){c[Za>>2]=0;c[_a>>2]=0;c[$a>>2]=0;c[ia>>2]=0;m=0}else{if((c[V>>2]|0)>>>0<=5?(c[l>>2]|0)>>>0<=5:0){if((b[V+28>>1]|0)==0?(b[l+48>>1]|0)==0:0)if((c[V+116>>2]|0)==(c[l+124>>2]|0)?(B=(b[V+132>>1]|0)-(b[l+172>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){h=(b[V+134>>1]|0)-(b[l+174>>1]|0)|0;h=(((h|0)>-1?h:0-h|0)|0)>3&1}else h=1;else h=2;c[ia>>2]=h;if((b[V+30>>1]|0)==0?(b[l+50>>1]|0)==0:0)if((c[V+116>>2]|0)==(c[l+124>>2]|0)?(B=(b[V+136>>1]|0)-(b[l+176>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){j=(b[V+138>>1]|0)-(b[l+178>>1]|0)|0;j=(((j|0)>-1?j:0-j|0)|0)>3&1}else j=1;else j=2;c[$a>>2]=j;if((b[V+36>>1]|0)==0?(b[l+56>>1]|0)==0:0)if((c[V+120>>2]|0)==(c[l+128>>2]|0)?(B=(b[V+148>>1]|0)-(b[l+188>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){k=(b[V+150>>1]|0)-(b[l+190>>1]|0)|0;k=(((k|0)>-1?k:0-k|0)|0)>3&1}else k=1;else k=2;c[_a>>2]=k;if((b[V+38>>1]|0)==0?(b[l+58>>1]|0)==0:0)if((c[V+120>>2]|0)==(c[l+128>>2]|0)?(B=(b[V+152>>1]|0)-(b[l+192>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){f=(b[V+154>>1]|0)-(b[l+194>>1]|0)|0;f=(((f|0)>-1?f:0-f|0)|0)>3&1}else f=1;else f=2;c[Za>>2]=f;m=(j|h|k|f|0)!=0&1;break}c[Za>>2]=4;c[_a>>2]=4;c[$a>>2]=4;c[ia>>2]=4;m=1}while(0);Q=(g&4|0)==0;do if(Q){c[la>>2]=0;c[ma>>2]=0;c[na>>2]=0;c[oa>>2]=0;k=c[V>>2]|0}else{k=c[V>>2]|0;if(k>>>0<=5?(c[n>>2]|0)>>>0<=5:0){if((b[V+28>>1]|0)==0?(b[n+38>>1]|0)==0:0)if((c[V+116>>2]|0)==(c[n+120>>2]|0)?(B=(b[V+132>>1]|0)-(b[n+152>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){j=(b[V+134>>1]|0)-(b[n+154>>1]|0)|0;j=(((j|0)>-1?j:0-j|0)|0)>3&1}else j=1;else j=2;c[oa>>2]=j;if((b[V+32>>1]|0)==0?(b[n+42>>1]|0)==0:0)if((c[V+116>>2]|0)==(c[n+120>>2]|0)?(B=(b[V+140>>1]|0)-(b[n+160>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){h=(b[V+142>>1]|0)-(b[n+162>>1]|0)|0;h=(((h|0)>-1?h:0-h|0)|0)>3&1}else h=1;else h=2;c[na>>2]=h;if((b[V+44>>1]|0)==0?(b[n+54>>1]|0)==0:0)if((c[V+124>>2]|0)==(c[n+128>>2]|0)?(B=(b[V+164>>1]|0)-(b[n+184>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){f=(b[V+166>>1]|0)-(b[n+186>>1]|0)|0;f=(((f|0)>-1?f:0-f|0)|0)>3&1}else f=1;else f=2;c[ma>>2]=f;if((b[V+48>>1]|0)==0?(b[n+58>>1]|0)==0:0)if((c[V+124>>2]|0)==(c[n+128>>2]|0)?(B=(b[V+172>>1]|0)-(b[n+192>>1]|0)|0,(((B|0)>-1?B:0-B|0)|0)<=3):0){l=(b[V+174>>1]|0)-(b[n+194>>1]|0)|0;l=(((l|0)>-1?l:0-l|0)|0)>3&1}else l=1;else l=2;c[la>>2]=l;if(m)break;m=(h|j|f|l|0)!=0&1;break}c[la>>2]=4;c[ma>>2]=4;c[na>>2]=4;c[oa>>2]=4;m=1}while(0);if(k>>>0<=5){do if((db(k)|0)!=1){f=c[V>>2]|0;if((f|0)==2){w=V+28|0;x=b[V+32>>1]|0;if(!(x<<16>>16))f=(b[w>>1]|0)!=0?2:0;else f=2;c[Ya>>2]=f;q=b[V+34>>1]|0;A=q<<16>>16==0;if(A)f=(b[V+30>>1]|0)!=0?2:0;else f=2;c[Xa>>2]=f;g=b[V+40>>1]|0;z=g<<16>>16==0;if(z)l=(b[V+36>>1]|0)!=0?2:0;else l=2;c[Wa>>2]=l;v=b[V+42>>1]|0;y=v<<16>>16==0;if(y)l=(b[V+38>>1]|0)!=0?2:0;else l=2;c[Va>>2]=l;h=b[V+48>>1]|0;if(!(h<<16>>16))l=(b[V+44>>1]|0)!=0?2:0;else l=2;c[Qa>>2]=l;k=b[V+50>>1]|0;B=k<<16>>16==0;if(B)l=(b[V+46>>1]|0)!=0?2:0;else l=2;c[Pa>>2]=l;p=b[V+56>>1]|0;f=p<<16>>16==0;if(f)n=(b[V+52>>1]|0)!=0?2:0;else n=2;c[Na>>2]=n;j=(b[V+58>>1]|0)==0;if(j)n=(b[V+54>>1]|0)!=0?2:0;else n=2;c[Ma>>2]=n;r=b[V+44>>1]|0;o=b[V+166>>1]|0;n=b[V+142>>1]|0;do if(!((r|x)<<16>>16)){u=(b[V+164>>1]|0)-(b[V+140>>1]|0)|0;if((((u|0)>-1?u:0-u|0)|0)>3){n=1;break}u=o-n|0;if((((u|0)>-1?u:0-u|0)|0)>3){n=1;break}n=(c[V+124>>2]|0)!=(c[V+116>>2]|0)&1}else n=2;while(0);c[Ua>>2]=n;s=b[V+46>>1]|0;o=b[V+170>>1]|0;n=b[V+146>>1]|0;do if(!((s|q)<<16>>16)){u=(b[V+168>>1]|0)-(b[V+144>>1]|0)|0;if((((u|0)>-1?u:0-u|0)|0)>3){o=1;break}u=o-n|0;if((((u|0)>-1?u:0-u|0)|0)>3){o=1;break}o=(c[V+124>>2]|0)!=(c[V+116>>2]|0)&1}else o=2;while(0);c[Ta>>2]=o;t=b[V+52>>1]|0;o=b[V+182>>1]|0;n=b[V+158>>1]|0;do if(!((t|g)<<16>>16)){u=(b[V+180>>1]|0)-(b[V+156>>1]|0)|0;if((((u|0)>-1?u:0-u|0)|0)>3){o=1;break}u=o-n|0;if((((u|0)>-1?u:0-u|0)|0)>3){o=1;break}o=(c[V+128>>2]|0)!=(c[V+120>>2]|0)&1}else o=2;while(0);c[Sa>>2]=o;u=b[V+54>>1]|0;o=b[V+186>>1]|0;n=b[V+162>>1]|0;do if(!((u|v)<<16>>16)){v=(b[V+184>>1]|0)-(b[V+160>>1]|0)|0;if((((v|0)>-1?v:0-v|0)|0)>3){o=1;break}v=o-n|0;if((((v|0)>-1?v:0-v|0)|0)>3){o=1;break}o=(c[V+128>>2]|0)!=(c[V+120>>2]|0)&1}else o=2;while(0);c[Ra>>2]=o;l=b[V+30>>1]|0;if(!(l<<16>>16))o=(b[w>>1]|0)!=0?2:0;else o=2;c[Aa>>2]=o;n=b[V+36>>1]|0;if(!(n<<16>>16))o=l<<16>>16!=0?2:0;else o=2;c[za>>2]=o;if(!(b[V+38>>1]|0))o=n<<16>>16!=0?2:0;else o=2;c[ya>>2]=o;if(A)n=x<<16>>16!=0?2:0;else n=2;c[xa>>2]=n;if(z)l=q<<16>>16!=0?2:0;else l=2;c[wa>>2]=l;if(y)l=g<<16>>16!=0?2:0;else l=2;c[va>>2]=l;if(!(s<<16>>16))l=r<<16>>16!=0?2:0;else l=2;c[ua>>2]=l;if(!(t<<16>>16))l=s<<16>>16!=0?2:0;else l=2;c[ta>>2]=l;if(!(u<<16>>16))l=t<<16>>16!=0?2:0;else l=2;c[sa>>2]=l;if(B)h=h<<16>>16!=0?2:0;else h=2;c[ra>>2]=h;if(f)f=k<<16>>16!=0?2:0;else f=2;c[qa>>2]=f;if(j)f=p<<16>>16!=0?2:0;else f=2;c[pa>>2]=f;break}else if((f|0)==3){j=V+28|0;v=b[V+32>>1]|0;if(!(v<<16>>16))f=(b[j>>1]|0)!=0?2:0;else f=2;c[Ya>>2]=f;B=b[V+34>>1]|0;p=B<<16>>16==0;if(p)h=(b[V+30>>1]|0)!=0?2:0;else h=2;c[Xa>>2]=h;z=b[V+40>>1]|0;if(!(z<<16>>16))k=(b[V+36>>1]|0)!=0?2:0;else k=2;c[Wa>>2]=k;o=b[V+42>>1]|0;h=o<<16>>16==0;if(h)l=(b[V+38>>1]|0)!=0?2:0;else l=2;c[Va>>2]=l;f=b[V+44>>1]|0;if(!(f<<16>>16))l=v<<16>>16!=0?2:0;else l=2;c[Ua>>2]=l;A=b[V+46>>1]|0;g=A<<16>>16==0;if(g)l=B<<16>>16!=0?2:0;else l=2;c[Ta>>2]=l;y=b[V+52>>1]|0;if(!(y<<16>>16))l=z<<16>>16!=0?2:0;else l=2;c[Sa>>2]=l;k=b[V+54>>1]|0;q=k<<16>>16==0;if(q)l=o<<16>>16!=0?2:0;else l=2;c[Ra>>2]=l;r=b[V+48>>1]|0;if(!(r<<16>>16))n=f<<16>>16!=0?2:0;else n=2;c[Qa>>2]=n;x=b[V+50>>1]|0;s=x<<16>>16==0;if(s)n=A<<16>>16!=0?2:0;else n=2;c[Pa>>2]=n;w=b[V+56>>1]|0;if(!(w<<16>>16))o=y<<16>>16!=0?2:0;else o=2;c[Na>>2]=o;u=(b[V+58>>1]|0)==0;if(u)o=k<<16>>16!=0?2:0;else o=2;c[Ma>>2]=o;t=b[V+30>>1]|0;if(!(t<<16>>16))o=(b[j>>1]|0)!=0?2:0;else o=2;c[Aa>>2]=o;if(!(b[V+38>>1]|0))o=(b[V+36>>1]|0)!=0?2:0;else o=2;c[ya>>2]=o;if(p)n=v<<16>>16!=0?2:0;else n=2;c[xa>>2]=n;if(h)n=z<<16>>16!=0?2:0;else n=2;c[va>>2]=n;if(g)l=f<<16>>16!=0?2:0;else l=2;c[ua>>2]=l;if(q)l=y<<16>>16!=0?2:0;else l=2;c[sa>>2]=l;if(s)l=r<<16>>16!=0?2:0;else l=2;c[ra>>2]=l;if(u)l=w<<16>>16!=0?2:0;else l=2;c[pa>>2]=l;l=b[V+150>>1]|0;k=b[V+138>>1]|0;do if(!((b[V+36>>1]|t)<<16>>16)){v=(b[V+148>>1]|0)-(b[V+136>>1]|0)|0;if((((v|0)>-1?v:0-v|0)|0)>3){l=1;break}v=l-k|0;if((((v|0)>-1?v:0-v|0)|0)>3){l=1;break}l=(c[V+120>>2]|0)!=(c[V+116>>2]|0)&1}else l=2;while(0);c[za>>2]=l;l=b[V+158>>1]|0;k=b[V+146>>1]|0;do if(!((z|B)<<16>>16)){B=(b[V+156>>1]|0)-(b[V+144>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){k=1;break}B=l-k|0;if((((B|0)>-1?B:0-B|0)|0)>3){k=1;break}k=(c[V+120>>2]|0)!=(c[V+116>>2]|0)&1}else k=2;while(0);c[wa>>2]=k;l=b[V+182>>1]|0;k=b[V+170>>1]|0;do if(!((y|A)<<16>>16)){B=(b[V+180>>1]|0)-(b[V+168>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){f=1;break}B=l-k|0;if((((B|0)>-1?B:0-B|0)|0)>3){f=1;break}f=(c[V+128>>2]|0)!=(c[V+124>>2]|0)&1}else f=2;while(0);c[ta>>2]=f;f=b[V+190>>1]|0;g=b[V+178>>1]|0;do if(!((w|x)<<16>>16)){B=(b[V+188>>1]|0)-(b[V+176>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){f=1;break}B=f-g|0;if((((B|0)>-1?B:0-B|0)|0)>3){f=1;break}f=(c[V+128>>2]|0)!=(c[V+124>>2]|0)&1}else f=2;while(0);c[qa>>2]=f;break}else{K=b[V+32>>1]|0;z=b[V+28>>1]|0;P=b[V+142>>1]|0;q=b[V+134>>1]|0;if(!((z|K)<<16>>16)){B=(b[V+140>>1]|0)-(b[V+132>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3)k=1;else{k=P-q|0;k=(((k|0)>-1?k:0-k|0)|0)>3&1}}else k=2;c[Ya>>2]=k;L=b[V+34>>1]|0;y=b[V+30>>1]|0;O=b[V+146>>1]|0;r=b[V+138>>1]|0;if(!((y|L)<<16>>16)){B=(b[V+144>>1]|0)-(b[V+136>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3)l=1;else{l=O-r|0;l=(((l|0)>-1?l:0-l|0)|0)>3&1}}else l=2;c[Xa>>2]=l;M=b[V+40>>1]|0;x=b[V+36>>1]|0;N=b[V+158>>1]|0;s=b[V+150>>1]|0;if(!((x|M)<<16>>16)){B=(b[V+156>>1]|0)-(b[V+148>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3)n=1;else{n=N-s|0;n=(((n|0)>-1?n:0-n|0)|0)>3&1}}else n=2;c[Wa>>2]=n;n=b[V+42>>1]|0;B=b[V+38>>1]|0;J=b[V+162>>1]|0;A=b[V+154>>1]|0;if(!((B|n)<<16>>16)){w=(b[V+160>>1]|0)-(b[V+152>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3)o=1;else{o=J-A|0;o=(((o|0)>-1?o:0-o|0)|0)>3&1}}else o=2;c[Va>>2]=o;D=b[V+44>>1]|0;I=b[V+166>>1]|0;do if(!((D|K)<<16>>16)){w=(b[V+164>>1]|0)-(b[V+140>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3)o=1;else{w=I-P|0;if((((w|0)>-1?w:0-w|0)|0)>3){o=1;break}o=(c[V+124>>2]|0)!=(c[V+116>>2]|0)&1}}else o=2;while(0);c[Ua>>2]=o;E=b[V+46>>1]|0;H=b[V+170>>1]|0;do if(!((E|L)<<16>>16)){w=(b[V+168>>1]|0)-(b[V+144>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){o=1;break}w=H-O|0;if((((w|0)>-1?w:0-w|0)|0)>3){o=1;break}o=(c[V+124>>2]|0)!=(c[V+116>>2]|0)&1}else o=2;while(0);c[Ta>>2]=o;F=b[V+52>>1]|0;G=b[V+182>>1]|0;do if(!((F|M)<<16>>16)){w=(b[V+180>>1]|0)-(b[V+156>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){o=1;break}w=G-N|0;if((((w|0)>-1?w:0-w|0)|0)>3){o=1;break}o=(c[V+128>>2]|0)!=(c[V+120>>2]|0)&1}else o=2;while(0);c[Sa>>2]=o;g=b[V+54>>1]|0;l=b[V+186>>1]|0;do if(!((g|n)<<16>>16)){w=(b[V+184>>1]|0)-(b[V+160>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){u=1;break}w=l-J|0;if((((w|0)>-1?w:0-w|0)|0)>3){u=1;break}u=(c[V+128>>2]|0)!=(c[V+120>>2]|0)&1}else u=2;while(0);c[Ra>>2]=u;f=b[V+48>>1]|0;C=b[V+174>>1]|0;do if(!((f|D)<<16>>16)){w=(b[V+172>>1]|0)-(b[V+164>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){u=1;break}u=C-I|0;u=(((u|0)>-1?u:0-u|0)|0)>3&1}else u=2;while(0);c[Qa>>2]=u;h=b[V+50>>1]|0;k=b[V+178>>1]|0;do if(!((h|E)<<16>>16)){w=(b[V+176>>1]|0)-(b[V+168>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){u=1;break}u=k-H|0;u=(((u|0)>-1?u:0-u|0)|0)>3&1}else u=2;while(0);c[Pa>>2]=u;j=b[V+56>>1]|0;p=b[V+190>>1]|0;do if(!((j|F)<<16>>16)){w=(b[V+188>>1]|0)-(b[V+180>>1]|0)|0;if((((w|0)>-1?w:0-w|0)|0)>3){u=1;break}u=p-G|0;u=(((u|0)>-1?u:0-u|0)|0)>3&1}else u=2;while(0);c[Na>>2]=u;w=b[V+58>>1]|0;t=b[V+194>>1]|0;do if(!((w|g)<<16>>16)){v=(b[V+192>>1]|0)-(b[V+184>>1]|0)|0;if((((v|0)>-1?v:0-v|0)|0)>3){v=1;break}v=t-l|0;v=(((v|0)>-1?v:0-v|0)|0)>3&1}else v=2;while(0);c[Ma>>2]=v;do if(!((y|z)<<16>>16)){z=(b[V+136>>1]|0)-(b[V+132>>1]|0)|0;if((((z|0)>-1?z:0-z|0)|0)>3){u=1;break}u=r-q|0;u=(((u|0)>-1?u:0-u|0)|0)>3&1}else u=2;while(0);c[Aa>>2]=u;do if(!((x|y)<<16>>16)){z=(b[V+148>>1]|0)-(b[V+136>>1]|0)|0;if((((z|0)>-1?z:0-z|0)|0)>3){u=1;break}z=s-r|0;if((((z|0)>-1?z:0-z|0)|0)>3){u=1;break}u=(c[V+120>>2]|0)!=(c[V+116>>2]|0)&1}else u=2;while(0);c[za>>2]=u;do if(!((B|x)<<16>>16)){B=(b[V+152>>1]|0)-(b[V+148>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){u=1;break}u=A-s|0;u=(((u|0)>-1?u:0-u|0)|0)>3&1}else u=2;while(0);c[ya>>2]=u;do if(!((L|K)<<16>>16)){B=(b[V+144>>1]|0)-(b[V+140>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){o=1;break}o=O-P|0;o=(((o|0)>-1?o:0-o|0)|0)>3&1}else o=2;while(0);c[xa>>2]=o;do if(!((M|L)<<16>>16)){B=(b[V+156>>1]|0)-(b[V+144>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){o=1;break}B=N-O|0;if((((B|0)>-1?B:0-B|0)|0)>3){o=1;break}o=(c[V+120>>2]|0)!=(c[V+116>>2]|0)&1}else o=2;while(0);c[wa>>2]=o;do if(!((n|M)<<16>>16)){B=(b[V+160>>1]|0)-(b[V+156>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){o=1;break}o=J-N|0;o=(((o|0)>-1?o:0-o|0)|0)>3&1}else o=2;while(0);c[va>>2]=o;do if(!((E|D)<<16>>16)){B=(b[V+168>>1]|0)-(b[V+164>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){n=1;break}n=H-I|0;n=(((n|0)>-1?n:0-n|0)|0)>3&1}else n=2;while(0);c[ua>>2]=n;do if(!((F|E)<<16>>16)){B=(b[V+180>>1]|0)-(b[V+168>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){n=1;break}B=G-H|0;if((((B|0)>-1?B:0-B|0)|0)>3){n=1;break}n=(c[V+128>>2]|0)!=(c[V+124>>2]|0)&1}else n=2;while(0);c[ta>>2]=n;do if(!((g|F)<<16>>16)){B=(b[V+184>>1]|0)-(b[V+180>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){l=1;break}l=l-G|0;l=(((l|0)>-1?l:0-l|0)|0)>3&1}else l=2;while(0);c[sa>>2]=l;do if(!((h|f)<<16>>16)){B=(b[V+176>>1]|0)-(b[V+172>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){l=1;break}l=k-C|0;l=(((l|0)>-1?l:0-l|0)|0)>3&1}else l=2;while(0);c[ra>>2]=l;do if(!((j|h)<<16>>16)){B=(b[V+188>>1]|0)-(b[V+176>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){k=1;break}B=p-k|0;if((((B|0)>-1?B:0-B|0)|0)>3){k=1;break}k=(c[V+128>>2]|0)!=(c[V+124>>2]|0)&1}else k=2;while(0);c[qa>>2]=k;do if(!((w|j)<<16>>16)){B=(b[V+192>>1]|0)-(b[V+188>>1]|0)|0;if((((B|0)>-1?B:0-B|0)|0)>3){f=1;break}f=t-p|0;f=(((f|0)>-1?f:0-f|0)|0)>3&1}else f=2;while(0);c[pa>>2]=f;break}}else vc(V,ia);while(0);if(!(m|c[Ya>>2]|c[Xa>>2]|c[Wa>>2]|c[Va>>2]|c[Ua>>2]|c[Ta>>2]|c[Sa>>2]|c[Ra>>2]|c[Qa>>2]|c[Pa>>2]|c[Na>>2]|c[Ma>>2]|c[Aa>>2]|c[za>>2]|c[ya>>2]|c[xa>>2]|c[wa>>2]|c[va>>2]|c[ua>>2]|c[ta>>2]|c[sa>>2]|c[ra>>2]|c[qa>>2]|c[pa>>2]))break}else{c[Ma>>2]=3;c[Na>>2]=3;c[Pa>>2]=3;c[Qa>>2]=3;c[Ra>>2]=3;c[Sa>>2]=3;c[Ta>>2]=3;c[Ua>>2]=3;c[Va>>2]=3;c[Wa>>2]=3;c[Xa>>2]=3;c[Ya>>2]=3;c[pa>>2]=3;c[qa>>2]=3;c[ra>>2]=3;c[sa>>2]=3;c[ta>>2]=3;c[ua>>2]=3;c[va>>2]=3;c[wa>>2]=3;c[xa>>2]=3;c[ya>>2]=3;c[za>>2]=3;c[Aa>>2]=3}J=V+20|0;g=c[J>>2]|0;L=V+12|0;k=Oa(0,51,(c[L>>2]|0)+g|0)|0;K=V+16|0;h=Oa(0,51,(c[K>>2]|0)+g|0)|0;j=d[6864+k>>0]|0;c[ha>>2]=j;h=d[6920+h>>0]|0;c[ja>>2]=h;k=6976+(k*3|0)|0;c[Ka>>2]=k;do if(!R){l=c[(c[S>>2]|0)+20>>2]|0;if((l|0)==(g|0)){c[X>>2]=j;c[_>>2]=h;c[La>>2]=k;break}else{A=(g+1+l|0)>>>1;B=Oa(0,51,(c[L>>2]|0)+A|0)|0;A=Oa(0,51,(c[K>>2]|0)+A|0)|0;c[X>>2]=d[6864+B>>0];c[_>>2]=d[6920+A>>0];c[La>>2]=6976+(B*3|0);break}}while(0);do if(!Q){f=c[(c[T>>2]|0)+20>>2]|0;if((f|0)==(g|0)){c[Y>>2]=c[ha>>2];c[$>>2]=c[ja>>2];c[da>>2]=c[Ka>>2];break}else{A=(g+1+f|0)>>>1;B=Oa(0,51,(c[L>>2]|0)+A|0)|0;A=Oa(0,51,(c[K>>2]|0)+A|0)|0;c[Y>>2]=d[6864+B>>0];c[$>>2]=d[6920+A>>0];c[da>>2]=6976+(B*3|0);break}}while(0);M=Z(aa,ea)|0;P=3;o=0;O=(c[e>>2]|0)+((M<<8)+(U<<4))|0;N=ia;while(1){l=c[N+4>>2]|0;if(l)wc(O,l,fa,Da);l=c[N+12>>2]|0;if(l)wc(O+4|0,l,ga,Da);k=N+16|0;m=c[N+20>>2]|0;if(m)wc(O+8|0,m,ga,Da);j=N+24|0;m=c[N+28>>2]|0;if(m)wc(O+12|0,m,ga,Da);n=c[N>>2]|0;l=N+8|0;m=c[l>>2]|0;a:do if(((n|0)==(m|0)?(n|0)==(c[k>>2]|0):0)?(n|0)==(c[j>>2]|0):0){if(!n)break;y=c[La+(o*12|0)+4>>2]|0;x=c[La+(o*12|0)+8>>2]|0;if(n>>>0<4){t=d[(c[La+(o*12|0)>>2]|0)+(n+-1)>>0]|0;k=0-t|0;j=t+1|0;f=O;h=16;while(1){o=f+Ca|0;s=d[o>>0]|0;u=f+Ja|0;r=d[u>>0]|0;q=d[f>>0]|0;m=f+Da|0;g=d[m>>0]|0;B=r-q|0;do if(((B|0)>-1?B:0-B|0)>>>0<y>>>0){B=s-r|0;if(((B|0)>-1?B:0-B|0)>>>0>=x>>>0)break;B=g-q|0;if(((B|0)>-1?B:0-B|0)>>>0>=x>>>0)break;n=d[f+Ha>>0]|0;B=n-r|0;if(((B|0)>-1?B:0-B|0)>>>0<x>>>0){a[o>>0]=(Oa(k,t,((r+1+q|0)>>>1)-(s<<1)+n>>1)|0)+s;o=j}else o=t;n=d[f+Ia>>0]|0;B=n-q|0;if(((B|0)>-1?B:0-B|0)>>>0<x>>>0){a[m>>0]=(Oa(k,t,((r+1+q|0)>>>1)-(g<<1)+n>>1)|0)+g;o=o+1|0}A=Oa(0-o|0,o,s+4-g+(q-r<<2)>>3)|0;B=a[3472+((q|512)-A)>>0]|0;a[u>>0]=a[3472+(A+(r|512))>>0]|0;a[f>>0]=B}while(0);h=h+-1|0;if(!h)break a;else f=f+1|0}}n=(y>>>2)+2|0;t=O;u=16;while(1){m=t+Ca|0;f=d[m>>0]|0;l=t+Ja|0;g=d[l>>0]|0;p=d[t>>0]|0;k=t+Da|0;q=d[k>>0]|0;o=g-p|0;o=(o|0)>-1?o:0-o|0;b:do if(o>>>0<y>>>0){B=f-g|0;if(((B|0)>-1?B:0-B|0)>>>0>=x>>>0)break;B=q-p|0;if(((B|0)>-1?B:0-B|0)>>>0>=x>>>0)break;j=t+Ha|0;r=d[j>>0]|0;h=t+Ia|0;s=d[h>>0]|0;do if(o>>>0<n>>>0){B=r-g|0;if(((B|0)>-1?B:0-B|0)>>>0<x>>>0){B=g+f+p|0;a[l>>0]=(q+4+(B<<1)+r|0)>>>3;a[m>>0]=(B+2+r|0)>>>2;a[j>>0]=(B+4+(r*3|0)+(d[t+Ea>>0]<<1)|0)>>>3}else a[l>>0]=(g+2+(f<<1)+q|0)>>>2;B=s-p|0;if(((B|0)>-1?B:0-B|0)>>>0>=x>>>0)break;B=p+g+q|0;a[t>>0]=(f+4+(B<<1)+s|0)>>>3;a[k>>0]=(B+2+s|0)>>>2;a[h>>0]=(B+4+(s*3|0)+(d[t+Ga>>0]<<1)|0)>>>3;break b}else a[l>>0]=(g+2+(f<<1)+q|0)>>>2;while(0);a[t>>0]=(f+2+p+(q<<1)|0)>>>2}while(0);u=u+-1|0;if(!u)break;else t=t+1|0}}else ab=311;while(0);do if((ab|0)==311){ab=0;if(n){xc(O,n,La+(o*12|0)|0,Da);m=c[l>>2]|0}if(m)xc(O+4|0,m,La+(o*12|0)|0,Da);m=c[k>>2]|0;if(m)xc(O+8|0,m,La+(o*12|0)|0,Da);l=c[j>>2]|0;if(!l)break;xc(O+12|0,l,La+(o*12|0)|0,Da)}while(0);if(!P)break;else{P=P+-1|0;o=2;O=O+Ba|0;N=N+32|0}}h=c[V+24>>2]|0;g=c[192+((Oa(0,51,(c[J>>2]|0)+h|0)|0)<<2)>>2]|0;m=Oa(0,51,(c[L>>2]|0)+g|0)|0;j=Oa(0,51,(c[K>>2]|0)+g|0)|0;k=d[6864+m>>0]|0;c[ha>>2]=k;j=d[6920+j>>0]|0;c[ja>>2]=j;m=6976+(m*3|0)|0;c[Ka>>2]=m;do if(!R){l=c[(c[S>>2]|0)+20>>2]|0;if((l|0)==(c[J>>2]|0)){c[X>>2]=k;c[_>>2]=j;c[La>>2]=m;break}else{A=(g+1+(c[192+((Oa(0,51,l+h|0)|0)<<2)>>2]|0)|0)>>>1;B=Oa(0,51,A+(c[L>>2]|0)|0)|0;A=Oa(0,51,(c[K>>2]|0)+A|0)|0;c[X>>2]=d[6864+B>>0];c[_>>2]=d[6920+A>>0];c[La>>2]=6976+(B*3|0);break}}while(0);do if(!Q){f=c[(c[T>>2]|0)+20>>2]|0;if((f|0)==(c[J>>2]|0)){c[Y>>2]=c[ha>>2];c[$>>2]=c[ja>>2];c[da>>2]=c[Ka>>2];break}else{A=(g+1+(c[192+((Oa(0,51,f+h|0)|0)<<2)>>2]|0)|0)>>>1;B=Oa(0,51,A+(c[L>>2]|0)|0)|0;A=Oa(0,51,(c[K>>2]|0)+A|0)|0;c[Y>>2]=d[6864+B>>0];c[$>>2]=d[6920+A>>0];c[da>>2]=6976+(B*3|0);break}}while(0);j=c[e>>2]|0;l=(U<<3)+Fa+(M<<6)|0;n=j+l|0;l=j+(l+ba)|0;j=0;h=ia;o=0;while(1){g=h+4|0;f=c[g>>2]|0;if(f){yc(n,f,fa,ca);yc(l,c[g>>2]|0,fa,ca)}g=h+36|0;f=c[g>>2]|0;if(f){yc(n+Da|0,f,fa,ca);yc(l+Da|0,c[g>>2]|0,fa,ca)}m=h+16|0;g=h+20|0;f=c[g>>2]|0;if(f){yc(n+4|0,f,ga,ca);yc(l+4|0,c[g>>2]|0,ga,ca)}g=h+52|0;f=c[g>>2]|0;if(f){yc(n+W|0,f,ga,ca);yc(l+W|0,c[g>>2]|0,ga,ca)}g=c[h>>2]|0;k=h+8|0;f=c[k>>2]|0;do if((g|0)==(f|0)){if((g|0)!=(c[m>>2]|0)){ab=342;break}if((g|0)!=(c[h+24>>2]|0)){ab=342;break}if(!g)break;B=La+(j*12|0)|0;zc(n,g,B,ca);zc(l,c[h>>2]|0,B,ca)}else ab=342;while(0);do if((ab|0)==342){ab=0;if(g){f=La+(j*12|0)|0;Ac(n,g,f,ca);Ac(l,c[h>>2]|0,f,ca);f=c[k>>2]|0}if(f){B=La+(j*12|0)|0;Ac(n+2|0,f,B,ca);Ac(l+2|0,c[k>>2]|0,B,ca)}f=c[m>>2]|0;if(f){B=La+(j*12|0)|0;Ac(n+4|0,f,B,ca);Ac(l+4|0,c[m>>2]|0,B,ca)}g=h+24|0;f=c[g>>2]|0;if(!f)break;B=La+(j*12|0)|0;Ac(n+6|0,f,B,ca);Ac(l+6|0,c[g>>2]|0,B,ca)}while(0);o=o+1|0;if((o|0)==2)break;else{n=n+Ia|0;l=l+Ia|0;j=2;h=h+64|0}}}while(0);f=U+1|0;g=(f|0)==(ea|0);aa=(g&1)+aa|0;if(aa>>>0>=(c[ka>>2]|0)>>>0)break;else{U=g?0:f;V=V+216|0}}i=bb;return}function vc(a,d){a=a|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0;B=i;l=a+28|0;y=b[a+32>>1]|0;if(!(y<<16>>16))e=(b[l>>1]|0)!=0?2:0;else e=2;c[d+32>>2]=e;z=b[a+34>>1]|0;x=z<<16>>16==0;if(x)e=(b[a+30>>1]|0)!=0?2:0;else e=2;c[d+40>>2]=e;A=b[a+40>>1]|0;v=A<<16>>16==0;if(v)e=(b[a+36>>1]|0)!=0?2:0;else e=2;c[d+48>>2]=e;f=b[a+42>>1]|0;w=f<<16>>16==0;if(w)e=(b[a+38>>1]|0)!=0?2:0;else e=2;c[d+56>>2]=e;s=b[a+44>>1]|0;if(!(s<<16>>16))e=y<<16>>16!=0?2:0;else e=2;c[d+64>>2]=e;t=b[a+46>>1]|0;p=t<<16>>16==0;if(p)e=z<<16>>16!=0?2:0;else e=2;c[d+72>>2]=e;u=b[a+52>>1]|0;q=u<<16>>16==0;if(q)e=A<<16>>16!=0?2:0;else e=2;c[d+80>>2]=e;g=b[a+54>>1]|0;r=g<<16>>16==0;if(r)e=f<<16>>16!=0?2:0;else e=2;c[d+88>>2]=e;m=b[a+48>>1]|0;if(!(m<<16>>16))e=s<<16>>16!=0?2:0;else e=2;c[d+96>>2]=e;n=b[a+50>>1]|0;h=n<<16>>16==0;if(h)e=t<<16>>16!=0?2:0;else e=2;c[d+104>>2]=e;o=b[a+56>>1]|0;j=o<<16>>16==0;if(j)f=u<<16>>16!=0?2:0;else f=2;c[d+112>>2]=f;k=(b[a+58>>1]|0)==0;if(k)f=g<<16>>16!=0?2:0;else f=2;c[d+120>>2]=f;g=b[a+30>>1]|0;if(!(g<<16>>16))f=(b[l>>1]|0)!=0?2:0;else f=2;c[d+12>>2]=f;e=b[a+36>>1]|0;if(!(e<<16>>16))f=g<<16>>16!=0?2:0;else f=2;c[d+20>>2]=f;if(!(b[a+38>>1]|0))e=e<<16>>16!=0?2:0;else e=2;c[d+28>>2]=e;if(x)e=y<<16>>16!=0?2:0;else e=2;c[d+44>>2]=e;if(v)e=z<<16>>16!=0?2:0;else e=2;c[d+52>>2]=e;if(w)e=A<<16>>16!=0?2:0;else e=2;c[d+60>>2]=e;if(p)e=s<<16>>16!=0?2:0;else e=2;c[d+76>>2]=e;if(q)e=t<<16>>16!=0?2:0;else e=2;c[d+84>>2]=e;if(r)e=u<<16>>16!=0?2:0;else e=2;c[d+92>>2]=e;if(h)e=m<<16>>16!=0?2:0;else e=2;c[d+108>>2]=e;if(j)e=n<<16>>16!=0?2:0;else e=2;c[d+116>>2]=e;if(!k){y=2;z=d+124|0;c[z>>2]=y;i=B;return}y=o<<16>>16!=0?2:0;z=d+124|0;c[z>>2]=y;i=B;return}function wc(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0;w=i;u=c[f+4>>2]|0;v=c[f+8>>2]|0;if(e>>>0<4){l=d[(c[f>>2]|0)+(e+-1)>>0]|0;n=0-l|0;m=l+1|0;k=4;while(1){f=b+-2|0;s=d[f>>0]|0;t=b+-1|0;r=d[t>>0]|0;q=d[b>>0]|0;j=b+1|0;h=d[j>>0]|0;o=r-q|0;if((((o|0)>-1?o:0-o|0)>>>0<u>>>0?(o=s-r|0,((o|0)>-1?o:0-o|0)>>>0<v>>>0):0)?(o=h-q|0,((o|0)>-1?o:0-o|0)>>>0<v>>>0):0){e=d[b+-3>>0]|0;p=d[b+2>>0]|0;o=e-r|0;if(((o|0)>-1?o:0-o|0)>>>0<v>>>0){a[f>>0]=(Oa(n,l,((r+1+q|0)>>>1)-(s<<1)+e>>1)|0)+s;f=m}else f=l;o=p-q|0;if(((o|0)>-1?o:0-o|0)>>>0<v>>>0){a[j>>0]=(Oa(n,l,((r+1+q|0)>>>1)-(h<<1)+p>>1)|0)+h;f=f+1|0}j=Oa(0-f|0,f,s+4-h+(q-r<<2)>>3)|0;o=a[3472+((q|512)-j)>>0]|0;a[t>>0]=a[3472+((r|512)+j)>>0]|0;a[b>>0]=o}k=k+-1|0;if(!k)break;else b=b+g|0}i=w;return}t=(u>>>2)+2|0;s=4;while(1){k=b+-2|0;q=d[k>>0]|0;l=b+-1|0;r=d[l>>0]|0;m=d[b>>0]|0;e=b+1|0;n=d[e>>0]|0;f=r-m|0;f=(f|0)>-1?f:0-f|0;do if((f>>>0<u>>>0?(o=q-r|0,((o|0)>-1?o:0-o|0)>>>0<v>>>0):0)?(o=n-m|0,((o|0)>-1?o:0-o|0)>>>0<v>>>0):0){h=b+-3|0;o=d[h>>0]|0;j=b+2|0;p=d[j>>0]|0;if(f>>>0<t>>>0){f=o-r|0;if(((f|0)>-1?f:0-f|0)>>>0<v>>>0){f=r+q+m|0;a[l>>0]=(n+4+(f<<1)+o|0)>>>3;a[k>>0]=(f+2+o|0)>>>2;a[h>>0]=(f+4+(o*3|0)+((d[b+-4>>0]|0)<<1)|0)>>>3}else a[l>>0]=(r+2+(q<<1)+n|0)>>>2;o=p-m|0;if(((o|0)>-1?o:0-o|0)>>>0<v>>>0){o=m+r+n|0;a[b>>0]=(q+4+(o<<1)+p|0)>>>3;a[e>>0]=(o+2+p|0)>>>2;a[j>>0]=(o+4+(p*3|0)+((d[b+3>>0]|0)<<1)|0)>>>3;break}}else a[l>>0]=(r+2+(q<<1)+n|0)>>>2;a[b>>0]=(q+2+m+(n<<1)|0)>>>2}while(0);s=s+-1|0;if(!s)break;else b=b+g|0}i=w;return}function xc(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0;A=i;u=d[(c[f>>2]|0)+(e+-1)>>0]|0;w=0-g|0;v=w<<1;t=f+4|0;o=f+8|0;q=Z(g,-3)|0;s=0-u|0;p=u+1|0;r=g<<1;n=4;while(1){e=b+v|0;k=b+w|0;j=b+g|0;f=a[j>>0]|0;l=d[k>>0]|0;m=d[b>>0]|0;h=l-m|0;if((((h|0)>-1?h:0-h|0)>>>0<(c[t>>2]|0)>>>0?(y=d[e>>0]|0,h=y-l|0,x=c[o>>2]|0,((h|0)>-1?h:0-h|0)>>>0<x>>>0):0)?(z=f&255,f=z-m|0,((f|0)>-1?f:0-f|0)>>>0<x>>>0):0){f=d[b+q>>0]|0;h=f-l|0;if(((h|0)>-1?h:0-h|0)>>>0<x>>>0){a[e>>0]=(Oa(s,u,((l+1+m|0)>>>1)-(y<<1)+f>>1)|0)+y;e=c[o>>2]|0;f=p}else{e=x;f=u}h=d[b+r>>0]|0;B=h-m|0;if(((B|0)>-1?B:0-B|0)>>>0<e>>>0){a[j>>0]=(Oa(s,u,((l+1+m|0)>>>1)-(z<<1)+h>>1)|0)+z;f=f+1|0}f=Oa(0-f|0,f,4-z+(m-l<<2)+y>>3)|0;e=a[3472+((m|512)-f)>>0]|0;a[k>>0]=a[3472+((l|512)+f)>>0]|0;a[b>>0]=e}n=n+-1|0;if(!n)break;else b=b+1|0}i=A;return}
function ya(a){a=a|0;var b=0;b=i;i=i+a|0;i=i+15&-16;return b|0}function za(){return i|0}function Aa(a){a=a|0;i=a}function Ba(a,b){a=a|0;b=b|0;if(!m){m=a;n=b}}function Ca(b){b=b|0;a[k>>0]=a[b>>0];a[k+1>>0]=a[b+1>>0];a[k+2>>0]=a[b+2>>0];a[k+3>>0]=a[b+3>>0]}function Da(b){b=b|0;a[k>>0]=a[b>>0];a[k+1>>0]=a[b+1>>0];a[k+2>>0]=a[b+2>>0];a[k+3>>0]=a[b+3>>0];a[k+4>>0]=a[b+4>>0];a[k+5>>0]=a[b+5>>0];a[k+6>>0]=a[b+6>>0];a[k+7>>0]=a[b+7>>0]}function Ea(a){a=a|0;B=a}function Fa(){return B|0}function Ga(a,b,e,f){a=a|0;b=b|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0;k=i;g=d[8+b>>0]|0;j=d[64+b>>0]|0;b=c[120+(j*12|0)>>2]<<g;h=c[124+(j*12|0)>>2]<<g;g=c[128+(j*12|0)>>2]<<g;if(!e)c[a>>2]=Z(c[a>>2]|0,b)|0;a:do if(!(f&65436)){if(f&98){n=a+4|0;l=Z(c[n>>2]|0,h)|0;j=a+20|0;m=Z(c[j>>2]|0,b)|0;e=a+24|0;g=Z(c[e>>2]|0,h)|0;h=c[a>>2]|0;b=(l>>1)-g|0;g=l+(g>>1)|0;l=m+h+32|0;f=l+g>>6;c[a>>2]=f;m=h-m+32|0;h=m+b>>6;c[n>>2]=h;b=m-b>>6;c[a+8>>2]=b;g=l-g>>6;c[a+12>>2]=g;c[a+48>>2]=f;c[a+32>>2]=f;c[a+16>>2]=f;c[a+52>>2]=h;c[a+36>>2]=h;c[j>>2]=h;c[a+56>>2]=b;c[a+40>>2]=b;c[e>>2]=b;c[a+60>>2]=g;c[a+44>>2]=g;c[a+28>>2]=g;if((f+512|0)>>>0>1023|(h+512|0)>>>0>1023|(b+512|0)>>>0>1023|(g+512|0)>>>0>1023)g=1;else break;i=k;return g|0}g=(c[a>>2]|0)+32>>6;if((g+512|0)>>>0>1023){m=1;i=k;return m|0}else{c[a+60>>2]=g;c[a+56>>2]=g;c[a+52>>2]=g;c[a+48>>2]=g;c[a+44>>2]=g;c[a+40>>2]=g;c[a+36>>2]=g;c[a+32>>2]=g;c[a+28>>2]=g;c[a+24>>2]=g;c[a+20>>2]=g;c[a+16>>2]=g;c[a+12>>2]=g;c[a+8>>2]=g;c[a+4>>2]=g;c[a>>2]=g;break}}else{z=a+4|0;s=a+56|0;w=a+60|0;t=c[w>>2]|0;u=Z(c[z>>2]|0,h)|0;c[s>>2]=Z(c[s>>2]|0,h)|0;c[w>>2]=Z(t,g)|0;w=a+8|0;t=c[w>>2]|0;s=a+16|0;y=Z(c[a+20>>2]|0,b)|0;o=Z(c[s>>2]|0,g)|0;q=a+12|0;p=c[q>>2]|0;f=Z(c[a+32>>2]|0,h)|0;e=Z(c[a+24>>2]|0,h)|0;r=c[a+28>>2]|0;j=Z(c[a+48>>2]|0,g)|0;n=Z(c[a+36>>2]|0,h)|0;l=c[a+44>>2]|0;m=Z(c[a+40>>2]|0,g)|0;g=Z(c[a+52>>2]|0,h)|0;x=c[a>>2]|0;v=y+x|0;y=x-y|0;x=(u>>1)-e|0;u=(e>>1)+u|0;e=u+v|0;c[a>>2]=e;c[z>>2]=x+y;c[w>>2]=y-x;c[q>>2]=v-u;q=Z(h,r+t|0)|0;r=Z(t-r|0,h)|0;h=(o>>1)-j|0;o=(j>>1)+o|0;j=o+q|0;c[s>>2]=j;c[a+20>>2]=h+r;c[a+24>>2]=r-h;c[a+28>>2]=q-o;o=Z(b,l+p|0)|0;b=Z(p-l|0,b)|0;l=(f>>1)-g|0;f=(g>>1)+f|0;h=f+o|0;c[a+32>>2]=h;c[a+36>>2]=l+b;c[a+40>>2]=b-l;c[a+44>>2]=o-f;f=a+56|0;o=c[f>>2]|0;l=o+n|0;o=n-o|0;b=a+60|0;g=c[b>>2]|0;n=(m>>1)-g|0;m=(g>>1)+m|0;g=m+l|0;c[a+48>>2]=g;c[a+52>>2]=n+o;c[f>>2]=o-n;c[b>>2]=l-m;b=j;j=3;while(1){v=(b>>1)-g|0;g=(g>>1)+b|0;w=h+e+32|0;x=w+g>>6;c[a>>2]=x;b=e-h+32|0;y=b+v>>6;c[a+16>>2]=y;b=b-v>>6;c[a+32>>2]=b;g=w-g>>6;c[a+48>>2]=g;if((x+512|0)>>>0>1023|(y+512|0)>>>0>1023){g=1;b=14;break}if((b+512|0)>>>0>1023|(g+512|0)>>>0>1023){g=1;b=14;break}f=a+4|0;if(!j)break a;e=c[f>>2]|0;h=c[a+36>>2]|0;b=c[a+20>>2]|0;g=c[a+52>>2]|0;a=f;j=j+-1|0}if((b|0)==14){i=k;return g|0}}while(0);y=0;i=k;return y|0}function Ha(b,d){b=b|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0;B=i;e=a[64+d>>0]|0;s=a[8+d>>0]|0;D=b+8|0;u=c[D>>2]|0;j=c[b+20>>2]|0;q=b+16|0;y=c[q>>2]|0;r=b+32|0;z=c[r>>2]|0;E=b+12|0;v=c[E>>2]|0;f=c[b+24>>2]|0;m=c[b+28>>2]|0;o=b+48|0;g=c[o>>2]|0;C=c[b+36>>2]|0;A=c[b+40>>2]|0;F=c[b+44>>2]|0;h=c[b+52>>2]|0;p=c[b>>2]|0;l=j+p|0;j=p-j|0;p=b+4|0;x=c[p>>2]|0;t=x-f|0;x=f+x|0;f=x+l|0;c[b>>2]=f;k=t+j|0;c[p>>2]=k;t=j-t|0;c[D>>2]=t;x=l-x|0;c[E>>2]=x;E=m+u|0;m=u-m|0;u=y-g|0;y=g+y|0;g=y+E|0;c[q>>2]=g;l=u+m|0;c[b+20>>2]=l;u=m-u|0;c[b+24>>2]=u;y=E-y|0;c[b+28>>2]=y;E=F+v|0;F=v-F|0;v=z-h|0;z=h+z|0;h=z+E|0;c[b+32>>2]=h;m=v+F|0;c[b+36>>2]=m;v=F-v|0;c[b+40>>2]=v;z=E-z|0;c[b+44>>2]=z;E=b+56|0;F=c[E>>2]|0;D=F+C|0;F=C-F|0;C=b+60|0;j=c[C>>2]|0;w=A-j|0;A=j+A|0;j=A+D|0;c[b+48>>2]=j;n=w+F|0;c[b+52>>2]=n;w=F-w|0;c[E>>2]=w;A=D-A|0;c[C>>2]=A;s=s&255;e=c[120+((e&255)*12|0)>>2]|0;if(d>>>0>11){d=e<<s+-2;s=h+f|0;h=f-h|0;f=g-j|0;e=j+g|0;c[b>>2]=Z(e+s|0,d)|0;c[q>>2]=Z(f+h|0,d)|0;c[r>>2]=Z(h-f|0,d)|0;c[o>>2]=Z(s-e|0,d)|0;r=m+k|0;e=k-m|0;q=l-n|0;s=n+l|0;c[p>>2]=Z(s+r|0,d)|0;c[b+20>>2]=Z(q+e|0,d)|0;c[b+36>>2]=Z(e-q|0,d)|0;c[b+52>>2]=Z(r-s|0,d)|0;s=v+t|0;t=t-v|0;v=u-w|0;w=w+u|0;c[b+8>>2]=Z(w+s|0,d)|0;c[b+24>>2]=Z(v+t|0,d)|0;c[b+40>>2]=Z(t-v|0,d)|0;c[b+56>>2]=Z(s-w|0,d)|0;w=z+x|0;v=x-z|0;x=y-A|0;y=A+y|0;c[b+12>>2]=Z(y+w|0,d)|0;c[b+28>>2]=Z(x+v|0,d)|0;c[b+44>>2]=Z(v-x|0,d)|0;c[b+60>>2]=Z(w-y|0,d)|0;i=B;return}else{C=(d+-6|0)>>>0<6?1:2;d=2-s|0;s=h+f|0;D=f-h|0;h=g-j|0;f=j+g|0;c[b>>2]=(Z(f+s|0,e)|0)+C>>d;c[q>>2]=(Z(h+D|0,e)|0)+C>>d;c[r>>2]=(Z(D-h|0,e)|0)+C>>d;c[o>>2]=(Z(s-f|0,e)|0)+C>>d;r=m+k|0;f=k-m|0;q=l-n|0;s=n+l|0;c[p>>2]=(Z(s+r|0,e)|0)+C>>d;c[b+20>>2]=(Z(q+f|0,e)|0)+C>>d;c[b+36>>2]=(Z(f-q|0,e)|0)+C>>d;c[b+52>>2]=(Z(r-s|0,e)|0)+C>>d;s=v+t|0;t=t-v|0;v=u-w|0;w=w+u|0;c[b+8>>2]=(Z(w+s|0,e)|0)+C>>d;c[b+24>>2]=(Z(v+t|0,e)|0)+C>>d;c[b+40>>2]=(Z(t-v|0,e)|0)+C>>d;c[b+56>>2]=(Z(s-w|0,e)|0)+C>>d;w=z+x|0;v=x-z|0;x=y-A|0;y=A+y|0;c[b+12>>2]=(Z(y+w|0,e)|0)+C>>d;c[b+28>>2]=(Z(x+v|0,e)|0)+C>>d;c[b+44>>2]=(Z(v-x|0,e)|0)+C>>d;c[b+60>>2]=(Z(w-y|0,e)|0)+C>>d;i=B;return}}function Ia(a,b){a=a|0;b=b|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0;e=c[120+((d[64+b>>0]|0)*12|0)>>2]|0;if(b>>>0>5){e=e<<(d[8+b>>0]|0)+-1;b=0}else b=1;k=c[a>>2]|0;g=a+8|0;h=c[g>>2]|0;m=h+k|0;h=k-h|0;k=a+4|0;j=c[k>>2]|0;l=a+12|0;f=c[l>>2]|0;i=j-f|0;j=f+j|0;c[a>>2]=(Z(j+m|0,e)|0)>>b;c[k>>2]=(Z(m-j|0,e)|0)>>b;c[g>>2]=(Z(i+h|0,e)|0)>>b;c[l>>2]=(Z(h-i|0,e)|0)>>b;l=a+16|0;i=c[l>>2]|0;h=a+24|0;g=c[h>>2]|0;k=g+i|0;g=i-g|0;i=a+20|0;j=c[i>>2]|0;a=a+28|0;m=c[a>>2]|0;f=j-m|0;j=m+j|0;c[l>>2]=(Z(j+k|0,e)|0)>>b;c[i>>2]=(Z(k-j|0,e)|0)>>b;c[h>>2]=(Z(f+g|0,e)|0)>>b;c[a>>2]=(Z(g-f|0,e)|0)>>b;return}function Ja(a,b){a=a|0;b=b|0;var c=0,d=0;d=i;b=1<<b+-1;if(!(b&a)){c=b;b=0}else{b=0;i=d;return b|0}do{b=b+1|0;c=c>>>1}while((c|0)!=0&(c&a|0)==0);i=d;return b|0}function Ka(a){a=a|0;var b=0,d=0;d=i;b=8-(c[a+8>>2]|0)|0;a=jb(a,b)|0;if((a|0)==-1){a=1;i=d;return a|0}a=(a|0)!=(c[400+(b+-1<<2)>>2]|0)&1;i=d;return a|0}function La(a){a=a|0;var b=0,d=0,e=0,f=0;d=i;f=c[a+12>>2]<<3;e=c[a+16>>2]|0;b=f-e|0;if((f|0)==(e|0)){a=0;i=d;return a|0}if(b>>>0>8){a=1;i=d;return a|0}else{a=((kb(a)|0)>>>(32-b|0)|0)!=(1<<b+-1|0)&1;i=d;return a|0}return 0}function Ma(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0;f=i;e=c[a+(d<<2)>>2]|0;do{d=d+1|0;if(d>>>0>=b>>>0)break}while((c[a+(d<<2)>>2]|0)!=(e|0));i=f;return ((d|0)==(b|0)?0:d)|0}function Na(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;e=c[a+4>>2]|0;f=(b>>>0)%(e>>>0)|0;d=b-f|0;b=Z(c[a+8>>2]|0,e)|0;e=c[a>>2]|0;c[a+12>>2]=e+((d<<8)+(f<<4));d=(f<<3)+(b<<8)+(d<<6)|0;c[a+16>>2]=e+d;c[a+20>>2]=e+(d+(b<<6));return}function Oa(a,b,c){a=a|0;b=b|0;c=c|0;if((c|0)>=(a|0))a=(c|0)>(b|0)?b:c;return a|0}function Pa(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0;s=i;a:do if(((e>>>0>3?(a[b>>0]|0)==0:0)?(a[b+1>>0]|0)==0:0)?(h=a[b+2>>0]|0,(h&255)<2):0){b:do if((e|0)!=3){p=-3;q=3;k=b+3|0;j=2;while(1){if(h<<24>>24)if(h<<24>>24==1&j>>>0>1){o=q;h=0;m=0;l=0;break}else j=0;else j=j+1|0;l=q+1|0;if((l|0)==(e|0))break b;h=a[k>>0]|0;p=~q;q=l;k=k+1|0}while(1){r=a[k>>0]|0;n=o+1|0;j=r<<24>>24!=0;l=(j&1^1)+l|0;h=r<<24>>24==3&(l|0)==2?1:h;if(r<<24>>24==1&l>>>0>1){r=14;break}if(j){m=l>>>0>2?1:m;l=0}if((n|0)==(e|0)){r=18;break}else{o=n;k=k+1|0}}if((r|0)==14){n=p+o-l|0;c[f+12>>2]=n;j=q;l=l-(l>>>0<3?l:3)|0;break a}else if((r|0)==18){n=p+e-l|0;c[f+12>>2]=n;j=q;break a}}while(0);c[g>>2]=e;q=1;i=s;return q|0}else r=19;while(0);if((r|0)==19){c[f+12>>2]=e;n=e;h=1;j=0;m=0;l=0}k=b+j|0;c[f>>2]=k;c[f+4>>2]=k;c[f+8>>2]=0;c[f+16>>2]=0;o=f+12|0;c[g>>2]=l+j+n;if(m){q=1;i=s;return q|0}if(!h){q=0;i=s;return q|0}l=c[o>>2]|0;h=k;m=k;j=0;c:while(1){while(1){q=l;l=l+-1|0;if(!q){r=31;break c}k=a[h>>0]|0;if((j|0)!=2)break;if(k<<24>>24!=3){r=29;break}if(!l){h=1;r=32;break c}h=h+1|0;if((d[h>>0]|0)>3){h=1;r=32;break c}else j=0}if((r|0)==29){r=0;if((k&255)<3){h=1;r=32;break}else j=2}a[m>>0]=k;h=h+1|0;m=m+1|0;j=k<<24>>24==0?j+1|0:0}if((r|0)==31){c[o>>2]=m-h+(c[o>>2]|0);q=0;i=s;return q|0}else if((r|0)==32){i=s;return h|0}return 0}function Qa(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0;o=i;i=i+16|0;n=o;id(b,0,92);f=jb(a,8)|0;a:do if((((f|0)!=-1?(c[b>>2]=f,jb(a,1)|0,jb(a,1)|0,(jb(a,1)|0)!=-1):0)?(jb(a,5)|0)!=-1:0)?(e=jb(a,8)|0,(e|0)!=-1):0){m=b+4|0;c[m>>2]=e;f=b+8|0;d=nb(a,f)|0;if(!d)if((c[f>>2]|0)>>>0<=31){d=nb(a,n)|0;if(!d){f=c[n>>2]|0;if(f>>>0<=12){c[b+12>>2]=1<<f+4;d=nb(a,n)|0;if(!d){f=c[n>>2]|0;if(f>>>0<=2){c[b+16>>2]=f;b:do if(!f){d=nb(a,n)|0;if(d)break a;f=c[n>>2]|0;if(f>>>0>12){d=1;break a}c[b+20>>2]=1<<f+4}else if((f|0)==1){f=jb(a,1)|0;if((f|0)==-1){d=1;break a}c[b+24>>2]=(f|0)==1&1;d=ob(a,b+28|0)|0;if(d)break a;d=ob(a,b+32|0)|0;if(d)break a;h=b+36|0;d=nb(a,h)|0;if(d)break a;f=c[h>>2]|0;if(f>>>0>255){d=1;break a}if(!f){c[b+40>>2]=0;break}f=fd(f<<2)|0;g=b+40|0;c[g>>2]=f;if(!f){d=65535;break a}if(c[h>>2]|0){e=0;while(1){d=ob(a,f+(e<<2)|0)|0;e=e+1|0;if(d)break a;if(e>>>0>=(c[h>>2]|0)>>>0)break b;f=c[g>>2]|0}}}while(0);l=b+44|0;d=nb(a,l)|0;if(!d)if((c[l>>2]|0)>>>0<=16?(k=jb(a,1)|0,(k|0)!=-1):0){c[b+48>>2]=(k|0)==1&1;d=nb(a,n)|0;if(!d){e=b+52|0;c[e>>2]=(c[n>>2]|0)+1;d=nb(a,n)|0;if(!d){k=b+56|0;c[k>>2]=(c[n>>2]|0)+1;h=jb(a,1)|0;if((!((h|0)==0|(h|0)==-1)?(jb(a,1)|0)!=-1:0)?(j=jb(a,1)|0,(j|0)!=-1):0){j=(j|0)==1;c[b+60>>2]=j&1;if(j){j=b+64|0;d=nb(a,j)|0;if(d)break;f=b+68|0;d=nb(a,f)|0;if(d)break;h=b+72|0;d=nb(a,h)|0;if(d)break;g=b+76|0;d=nb(a,g)|0;if(d)break;e=c[e>>2]|0;if((c[j>>2]|0)>((e<<3)+~c[f>>2]|0)){d=1;break}f=c[k>>2]|0;if((c[h>>2]|0)>((f<<3)+~c[g>>2]|0)){d=1;break}}else{e=c[e>>2]|0;f=c[k>>2]|0}d=Z(f,e)|0;do switch(c[m>>2]|0){case 11:{f=396;e=345600;g=58;break}case 12:{f=396;e=912384;g=58;break}case 13:{f=396;e=912384;g=58;break}case 20:{f=396;e=912384;g=58;break}case 21:{f=792;e=1824768;g=58;break}case 22:{f=1620;e=3110400;g=58;break}case 30:{f=1620;e=3110400;g=58;break}case 31:{f=3600;e=6912e3;g=58;break}case 32:{f=5120;e=7864320;g=58;break}case 40:{f=8192;e=12582912;g=58;break}case 41:{f=8192;e=12582912;g=58;break}case 42:{f=8704;e=13369344;g=58;break}case 50:{f=22080;e=42393600;g=58;break}case 51:{f=36864;e=70778880;g=58;break}case 10:{f=99;e=152064;g=58;break}default:g=60}while(0);do if((g|0)==58){if(f>>>0<d>>>0){g=60;break}e=(e>>>0)/((d*384|0)>>>0)|0;e=e>>>0<16?e:16;c[n>>2]=e;f=c[l>>2]|0;if(f>>>0>e>>>0){e=f;g=61}}while(0);if((g|0)==60){c[n>>2]=2147483647;e=c[l>>2]|0;g=61}if((g|0)==61)c[n>>2]=e;g=b+88|0;c[g>>2]=e;e=jb(a,1)|0;if((e|0)==-1){d=1;break}n=(e|0)==1;c[b+80>>2]=n&1;do if(n){e=fd(952)|0;f=b+84|0;c[f>>2]=e;if(!e){d=65535;break a}d=Ec(a,e)|0;if(d)break a;d=c[f>>2]|0;if(!(c[d+920>>2]|0))break;e=c[d+948>>2]|0;if((c[d+944>>2]|0)>>>0>e>>>0){d=1;break a}if(e>>>0<(c[l>>2]|0)>>>0){d=1;break a}if(e>>>0>(c[g>>2]|0)>>>0){d=1;break a}c[g>>2]=(e|0)==0?1:e}while(0);Ka(a)|0;d=0}else d=1}}}else d=1}else d=1}}else d=1}}else d=1}else d=1;while(0);i=o;return d|0}function Ra(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0;j=i;if((c[a>>2]|0)!=(c[b>>2]|0)){d=1;i=j;return d|0}if((c[a+4>>2]|0)!=(c[b+4>>2]|0)){d=1;i=j;return d|0}if((c[a+12>>2]|0)!=(c[b+12>>2]|0)){d=1;i=j;return d|0}d=c[a+16>>2]|0;if((d|0)!=(c[b+16>>2]|0)){d=1;i=j;return d|0}if((c[a+44>>2]|0)!=(c[b+44>>2]|0)){d=1;i=j;return d|0}if((c[a+48>>2]|0)!=(c[b+48>>2]|0)){d=1;i=j;return d|0}if((c[a+52>>2]|0)!=(c[b+52>>2]|0)){d=1;i=j;return d|0}if((c[a+56>>2]|0)!=(c[b+56>>2]|0)){d=1;i=j;return d|0}h=c[a+60>>2]|0;if((h|0)!=(c[b+60>>2]|0)){d=1;i=j;return d|0}if((c[a+80>>2]|0)!=(c[b+80>>2]|0)){d=1;i=j;return d|0}a:do if(!d){if((c[a+20>>2]|0)!=(c[b+20>>2]|0)){d=1;i=j;return d|0}}else if((d|0)==1){if((c[a+24>>2]|0)!=(c[b+24>>2]|0)){d=1;i=j;return d|0}if((c[a+28>>2]|0)!=(c[b+28>>2]|0)){d=1;i=j;return d|0}if((c[a+32>>2]|0)!=(c[b+32>>2]|0)){d=1;i=j;return d|0}d=c[a+36>>2]|0;if((d|0)!=(c[b+36>>2]|0)){d=1;i=j;return d|0}if(d){e=c[a+40>>2]|0;f=c[b+40>>2]|0;g=0;while(1){if((c[e+(g<<2)>>2]|0)!=(c[f+(g<<2)>>2]|0)){d=1;break}g=g+1|0;if(g>>>0>=d>>>0)break a}i=j;return d|0}}while(0);if(h){if((c[a+64>>2]|0)!=(c[b+64>>2]|0)){d=1;i=j;return d|0}if((c[a+68>>2]|0)!=(c[b+68>>2]|0)){d=1;i=j;return d|0}if((c[a+72>>2]|0)!=(c[b+72>>2]|0)){d=1;i=j;return d|0}if((c[a+76>>2]|0)!=(c[b+76>>2]|0)){d=1;i=j;return d|0}}d=0;i=j;return d|0}function Sa(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0;l=i;i=i+16|0;j=l+4|0;k=l;id(b,0,72);d=nb(a,b)|0;if(d){i=l;return d|0}if((c[b>>2]|0)>>>0>255){d=1;i=l;return d|0}e=b+4|0;d=nb(a,e)|0;if(d){i=l;return d|0}if((c[e>>2]|0)>>>0>31){d=1;i=l;return d|0}if(jb(a,1)|0){d=1;i=l;return d|0}d=jb(a,1)|0;if((d|0)==-1){d=1;i=l;return d|0}c[b+8>>2]=(d|0)==1&1;d=nb(a,j)|0;if(d){i=l;return d|0}d=(c[j>>2]|0)+1|0;h=b+12|0;c[h>>2]=d;if(d>>>0>8){d=1;i=l;return d|0}a:do if(d>>>0>1){d=b+16|0;e=nb(a,d)|0;if(e){d=e;i=l;return d|0}d=c[d>>2]|0;if(d>>>0>6){d=1;i=l;return d|0}switch(d|0){case 5:case 4:case 3:{d=jb(a,1)|0;if((d|0)==-1){d=1;i=l;return d|0}c[b+32>>2]=(d|0)==1&1;d=nb(a,j)|0;if(!d){c[b+36>>2]=(c[j>>2]|0)+1;break a}else{i=l;return d|0}}case 0:{d=fd(c[h>>2]<<2)|0;f=b+20|0;c[f>>2]=d;if(!d){d=65535;i=l;return d|0}if(!(c[h>>2]|0))break a;else e=0;while(1){d=nb(a,j)|0;if(d)break;c[(c[f>>2]|0)+(e<<2)>>2]=(c[j>>2]|0)+1;e=e+1|0;if(e>>>0>=(c[h>>2]|0)>>>0)break a}i=l;return d|0}case 2:{e=b+24|0;c[e>>2]=fd((c[h>>2]<<2)+-4|0)|0;d=fd((c[h>>2]<<2)+-4|0)|0;g=b+28|0;c[g>>2]=d;if((c[e>>2]|0)==0|(d|0)==0){d=65535;i=l;return d|0}if((c[h>>2]|0)==1)break a;else f=0;while(1){d=nb(a,j)|0;if(d){e=46;break}c[(c[e>>2]|0)+(f<<2)>>2]=c[j>>2];d=nb(a,j)|0;if(d){e=46;break}c[(c[g>>2]|0)+(f<<2)>>2]=c[j>>2];f=f+1|0;if(f>>>0>=((c[h>>2]|0)+-1|0)>>>0)break a}if((e|0)==46){i=l;return d|0}break}case 6:{d=nb(a,j)|0;if(d){i=l;return d|0}e=(c[j>>2]|0)+1|0;d=b+40|0;c[d>>2]=e;e=fd(e<<2)|0;g=b+44|0;c[g>>2]=e;if(!e){d=65535;i=l;return d|0}f=c[432+((c[h>>2]|0)+-1<<2)>>2]|0;if(!(c[d>>2]|0))break a;else e=0;while(1){m=jb(a,f)|0;c[(c[g>>2]|0)+(e<<2)>>2]=m;e=e+1|0;if(m>>>0>=(c[h>>2]|0)>>>0){d=1;break}if(e>>>0>=(c[d>>2]|0)>>>0)break a}i=l;return d|0}default:break a}}while(0);d=nb(a,j)|0;if(d){a=d;i=l;return a|0}d=c[j>>2]|0;if(d>>>0>31){a=1;i=l;return a|0}c[b+48>>2]=d+1;d=nb(a,j)|0;if(d){a=d;i=l;return a|0}if((c[j>>2]|0)>>>0>31){a=1;i=l;return a|0}if(jb(a,1)|0){a=1;i=l;return a|0}if((jb(a,2)|0)>>>0>2){a=1;i=l;return a|0}d=ob(a,k)|0;if(d){a=d;i=l;return a|0}d=(c[k>>2]|0)+26|0;if(d>>>0>51){a=1;i=l;return a|0}c[b+52>>2]=d;d=ob(a,k)|0;if(d){a=d;i=l;return a|0}if(((c[k>>2]|0)+26|0)>>>0>51){a=1;i=l;return a|0}d=ob(a,k)|0;if(d){a=d;i=l;return a|0}d=c[k>>2]|0;if((d+12|0)>>>0>24){a=1;i=l;return a|0}c[b+56>>2]=d;d=jb(a,1)|0;if((d|0)==-1){a=1;i=l;return a|0}c[b+60>>2]=(d|0)==1&1;d=jb(a,1)|0;if((d|0)==-1){a=1;i=l;return a|0}c[b+64>>2]=(d|0)==1&1;d=jb(a,1)|0;if((d|0)==-1){a=1;i=l;return a|0}c[b+68>>2]=(d|0)==1&1;Ka(a)|0;a=0;i=l;return a|0}function Ta(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0;w=i;i=i+32|0;s=w+20|0;q=w+16|0;o=w+12|0;l=w+8|0;v=w+4|0;t=w;id(b,0,988);u=Z(c[d+56>>2]|0,c[d+52>>2]|0)|0;k=nb(a,v)|0;if(k){f=k;i=w;return f|0}n=c[v>>2]|0;c[b>>2]=n;if(n>>>0>=u>>>0){f=1;i=w;return f|0}k=nb(a,v)|0;if(k){f=k;i=w;return f|0}k=c[v>>2]|0;m=b+4|0;c[m>>2]=k;if((k|0)==5|(k|0)==0)j=5;else if(!((k|0)==7|(k|0)==2)){f=1;i=w;return f|0}if((j|0)==5){if((c[f>>2]|0)==5){f=1;i=w;return f|0}if(!(c[d+44>>2]|0)){f=1;i=w;return f|0}}k=nb(a,v)|0;if(k){f=k;i=w;return f|0}n=c[v>>2]|0;c[b+8>>2]=n;if((n|0)!=(c[e>>2]|0)){f=1;i=w;return f|0}n=d+12|0;k=c[n>>2]|0;j=0;while(1)if(!(k>>>j))break;else j=j+1|0;k=jb(a,j+-1|0)|0;if((k|0)==-1){f=1;i=w;return f|0}j=(c[f>>2]|0)==5;if(j&(k|0)!=0){f=1;i=w;return f|0}c[b+12>>2]=k;if(j){k=nb(a,v)|0;if(k){f=k;i=w;return f|0}k=c[v>>2]|0;c[b+16>>2]=k;if(k>>>0>65535){f=1;i=w;return f|0}}g=d+16|0;k=c[g>>2]|0;if(!k){h=d+20|0;k=c[h>>2]|0;j=0;while(1)if(!(k>>>j))break;else j=j+1|0;k=jb(a,j+-1|0)|0;if((k|0)==-1){f=1;i=w;return f|0}j=b+20|0;c[j>>2]=k;do if(c[e+8>>2]|0){k=ob(a,t)|0;if(!k){c[b+24>>2]=c[t>>2];break}else{f=k;i=w;return f|0}}while(0);if((c[f>>2]|0)==5){k=c[j>>2]|0;if(k>>>0>(c[h>>2]|0)>>>1>>>0){f=1;i=w;return f|0}j=c[b+24>>2]|0;if((k|0)!=(((j|0)>0?0:0-j|0)|0)){f=1;i=w;return f|0}}k=c[g>>2]|0}if((k|0)==1?(c[d+24>>2]|0)==0:0){k=ob(a,t)|0;if(k){f=k;i=w;return f|0}k=b+28|0;c[k>>2]=c[t>>2];do if(c[e+8>>2]|0){j=ob(a,t)|0;if(!j){c[b+32>>2]=c[t>>2];break}else{f=j;i=w;return f|0}}while(0);if((c[f>>2]|0)==5?(j=c[k>>2]|0,k=(c[d+32>>2]|0)+j+(c[b+32>>2]|0)|0,(((j|0)<(k|0)?j:k)|0)!=0):0){f=1;i=w;return f|0}}if(c[e+68>>2]|0){k=nb(a,v)|0;if(k){f=k;i=w;return f|0}k=c[v>>2]|0;c[b+36>>2]=k;if(k>>>0>127){f=1;i=w;return f|0}}k=c[m>>2]|0;if((k|0)==5|(k|0)==0){k=jb(a,1)|0;if((k|0)==-1){f=1;i=w;return f|0}c[b+40>>2]=k;do if(!k){k=c[e+48>>2]|0;if(k>>>0>16){f=1;i=w;return f|0}else{c[b+44>>2]=k;break}}else{k=nb(a,v)|0;if(k){f=k;i=w;return f|0}k=c[v>>2]|0;if(k>>>0>15){f=1;i=w;return f|0}else{c[b+44>>2]=k+1;break}}while(0);k=c[m>>2]|0}do if((k|0)==5|(k|0)==0){g=c[b+44>>2]|0;j=c[n>>2]|0;k=jb(a,1)|0;if((k|0)==-1){f=1;i=w;return f|0}c[b+68>>2]=k;if(k){h=0;a:while(1){if(h>>>0>g>>>0){r=1;j=110;break}k=nb(a,l)|0;if(k){r=k;j=110;break}k=c[l>>2]|0;if(k>>>0>3){r=1;j=110;break}c[b+(h*12|0)+72>>2]=k;do if(k>>>0<2){k=nb(a,o)|0;if(k){r=k;j=110;break a}k=c[o>>2]|0;if(k>>>0>=j>>>0){r=1;j=110;break a}c[b+(h*12|0)+76>>2]=k+1}else{if((k|0)!=2)break;k=nb(a,o)|0;if(k){r=k;j=110;break a}c[b+(h*12|0)+80>>2]=c[o>>2]}while(0);if((c[l>>2]|0)==3){j=61;break}else h=h+1|0}if((j|0)==61){if(!h)r=1;else break;i=w;return r|0}else if((j|0)==110){i=w;return r|0}}}while(0);do if(c[f+4>>2]|0){n=c[d+44>>2]|0;f=(c[f>>2]|0)==5;k=jb(a,1)|0;j=(k|0)==-1;if(f){if(j){f=1;i=w;return f|0}c[b+276>>2]=k;g=jb(a,1)|0;if((g|0)==-1){f=1;i=w;return f|0}c[b+280>>2]=g;if((n|0)!=0|(g|0)==0)break;else r=1;i=w;return r|0}if(j){f=1;i=w;return f|0}c[b+284>>2]=k;if(k){j=(n<<1)+2|0;h=0;d=0;g=0;l=0;m=0;while(1){if(h>>>0>j>>>0){r=1;j=110;break}k=nb(a,q)|0;if(k){r=k;j=110;break}k=c[q>>2]|0;if(k>>>0>6){r=1;j=110;break}c[b+(h*20|0)+288>>2]=k;if((k&-3|0)==1){k=nb(a,s)|0;if(k){r=k;j=110;break}c[b+(h*20|0)+292>>2]=(c[s>>2]|0)+1;k=c[q>>2]|0}if((k|0)==2){k=nb(a,s)|0;if(k){r=k;j=110;break}c[b+(h*20|0)+296>>2]=c[s>>2];k=c[q>>2]|0}if((k|0)==3|(k|0)==6){k=nb(a,s)|0;if(k){r=k;j=110;break}c[b+(h*20|0)+300>>2]=c[s>>2];k=c[q>>2]|0}if((k|0)==4){k=nb(a,s)|0;if(k){r=k;j=110;break}k=c[s>>2]|0;if(k>>>0>n>>>0){r=1;j=110;break}if(!k)c[b+(h*20|0)+304>>2]=65535;else c[b+(h*20|0)+304>>2]=k+-1;k=c[q>>2]|0;p=g+1|0}else p=g;l=((k|0)==5&1)+l|0;d=((k|0)!=0&k>>>0<4&1)+d|0;m=((k|0)==6&1)+m|0;if(!k){j=90;break}else{h=h+1|0;g=p}}if((j|0)==90){if(p>>>0>1|l>>>0>1|m>>>0>1){f=1;i=w;return f|0}if((d|0)!=0&(l|0)!=0)r=1;else break;i=w;return r|0}else if((j|0)==110){i=w;return r|0}}}while(0);g=ob(a,t)|0;if(g){f=g;i=w;return f|0}f=c[t>>2]|0;c[b+48>>2]=f;f=f+(c[e+52>>2]|0)|0;c[t>>2]=f;if(f>>>0>51){f=1;i=w;return f|0}do if(c[e+60>>2]|0){g=nb(a,v)|0;if(g){f=g;i=w;return f|0}g=c[v>>2]|0;c[b+52>>2]=g;if(g>>>0>2){f=1;i=w;return f|0}if((g|0)==1)break;g=ob(a,t)|0;if(g){f=g;i=w;return f|0}g=c[t>>2]|0;if((g+6|0)>>>0>12){f=1;i=w;return f|0}c[b+56>>2]=g<<1;g=ob(a,t)|0;if(g){f=g;i=w;return f|0}g=c[t>>2]|0;if((g+6|0)>>>0>12){f=1;i=w;return f|0}else{c[b+60>>2]=g<<1;break}}while(0);do if((c[e+12>>2]|0)>>>0>1?((c[e+16>>2]|0)+-3|0)>>>0<3:0){k=e+36|0;j=c[k>>2]|0;j=(((u>>>0)%(j>>>0)|0|0)==0?1:2)+((u>>>0)/(j>>>0)|0)|0;h=0;while(1){g=h+1|0;if(!(-1<<g&j))break;else h=g}g=jb(a,((1<<h)+-1&j|0)==0?h:g)|0;c[v>>2]=g;if((g|0)==-1){f=1;i=w;return f|0}c[b+64>>2]=g;f=c[k>>2]|0;if(g>>>0>(((u+-1+f|0)>>>0)/(f>>>0)|0)>>>0)r=1;else break;i=w;return r|0}while(0);f=0;i=w;return f|0}function Ua(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;f=i;i=i+32|0;e=f+20|0;d=f;c[d+0>>2]=c[a+0>>2];c[d+4>>2]=c[a+4>>2];c[d+8>>2]=c[a+8>>2];c[d+12>>2]=c[a+12>>2];c[d+16>>2]=c[a+16>>2];a=nb(d,e)|0;if(!a){a=nb(d,e)|0;if(!a){a=nb(d,e)|0;if(!a){a=c[e>>2]|0;if(a>>>0>255)a=1;else{c[b>>2]=a;a=0}}}}i=f;return a|0}function Va(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;g=i;i=i+32|0;e=g+20|0;f=g;c[f+0>>2]=c[a+0>>2];c[f+4>>2]=c[a+4>>2];c[f+8>>2]=c[a+8>>2];c[f+12>>2]=c[a+12>>2];c[f+16>>2]=c[a+16>>2];a=nb(f,e)|0;if(a){i=g;return a|0}a=nb(f,e)|0;if(a){i=g;return a|0}a=nb(f,e)|0;if(!a)a=0;else{i=g;return a|0}while(1)if(!(b>>>a))break;else a=a+1|0;a=jb(f,a+-1|0)|0;if((a|0)==-1){a=1;i=g;return a|0}c[d>>2]=a;a=0;i=g;return a|0}function Wa(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0;h=i;i=i+32|0;f=h+20|0;g=h;if((d|0)!=5){d=1;i=h;return d|0};c[g+0>>2]=c[a+0>>2];c[g+4>>2]=c[a+4>>2];c[g+8>>2]=c[a+8>>2];c[g+12>>2]=c[a+12>>2];c[g+16>>2]=c[a+16>>2];d=nb(g,f)|0;if(d){i=h;return d|0}d=nb(g,f)|0;if(d){i=h;return d|0}d=nb(g,f)|0;if(!d)d=0;else{i=h;return d|0}while(1)if(!(b>>>d))break;else d=d+1|0;if((jb(g,d+-1|0)|0)==-1){d=1;i=h;return d|0}d=nb(g,e)|0;i=h;return d|0}function Xa(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0;k=i;i=i+32|0;h=k+20|0;j=k;c[j+0>>2]=c[a+0>>2];c[j+4>>2]=c[a+4>>2];c[j+8>>2]=c[a+8>>2];c[j+12>>2]=c[a+12>>2];c[j+16>>2]=c[a+16>>2];a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=c[b+12>>2]|0;f=0;while(1)if(!(a>>>f))break;else f=f+1|0;if((jb(j,f+-1|0)|0)==-1){f=1;i=k;return f|0}if((d|0)==5?(g=nb(j,h)|0,(g|0)!=0):0){f=g;i=k;return f|0}f=c[b+20>>2]|0;a=0;while(1)if(!(f>>>a))break;else a=a+1|0;f=jb(j,a+-1|0)|0;if((f|0)==-1){f=1;i=k;return f|0}c[e>>2]=f;f=0;i=k;return f|0}function Ya(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0;k=i;i=i+32|0;h=k+20|0;j=k;c[j+0>>2]=c[a+0>>2];c[j+4>>2]=c[a+4>>2];c[j+8>>2]=c[a+8>>2];c[j+12>>2]=c[a+12>>2];c[j+16>>2]=c[a+16>>2];a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=nb(j,h)|0;if(a){f=a;i=k;return f|0}a=c[b+12>>2]|0;f=0;while(1)if(!(a>>>f))break;else f=f+1|0;if((jb(j,f+-1|0)|0)==-1){f=1;i=k;return f|0}if((d|0)==5?(g=nb(j,h)|0,(g|0)!=0):0){f=g;i=k;return f|0}f=c[b+20>>2]|0;a=0;while(1)if(!(f>>>a))break;else a=a+1|0;if((jb(j,a+-1|0)|0)==-1){f=1;i=k;return f|0}f=ob(j,e)|0;i=k;return f|0}function Za(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0;m=i;i=i+32|0;j=m+20|0;l=m;c[l+0>>2]=c[a+0>>2];c[l+4>>2]=c[a+4>>2];c[l+8>>2]=c[a+8>>2];c[l+12>>2]=c[a+12>>2];c[l+16>>2]=c[a+16>>2];g=nb(l,j)|0;if(g){l=g;i=m;return l|0}g=nb(l,j)|0;if(g){l=g;i=m;return l|0}g=nb(l,j)|0;if(g){l=g;i=m;return l|0}g=c[b+12>>2]|0;a=0;while(1)if(!(g>>>a))break;else a=a+1|0;if((jb(l,a+-1|0)|0)==-1){l=1;i=m;return l|0}if((d|0)==5?(h=nb(l,j)|0,(h|0)!=0):0){l=h;i=m;return l|0}g=ob(l,f)|0;if(g){l=g;i=m;return l|0}if((e|0)!=0?(k=ob(l,f+4|0)|0,(k|0)!=0):0){l=k;i=m;return l|0}l=0;i=m;return l|0}function _a(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0;m=i;i=i+32|0;l=m+24|0;j=m+20|0;k=m;c[k+0>>2]=c[b+0>>2];c[k+4>>2]=c[b+4>>2];c[k+8>>2]=c[b+8>>2];c[k+12>>2]=c[b+12>>2];c[k+16>>2]=c[b+16>>2];f=nb(k,l)|0;if(f){n=f;i=m;return n|0}f=nb(k,l)|0;if(f){n=f;i=m;return n|0}f=nb(k,l)|0;if(f){n=f;i=m;return n|0}f=c[d+12>>2]|0;b=0;while(1)if(!(f>>>b))break;else b=b+1|0;if((jb(k,b+-1|0)|0)==-1){n=1;i=m;return n|0}f=nb(k,l)|0;if(f){n=f;i=m;return n|0}g=d+16|0;f=c[g>>2]|0;if(!f){b=c[d+20>>2]|0;f=0;while(1)if(!(b>>>f))break;else f=f+1|0;if((jb(k,f+-1|0)|0)==-1){n=1;i=m;return n|0}if((c[e+8>>2]|0)!=0?(h=ob(k,j)|0,(h|0)!=0):0){n=h;i=m;return n|0}f=c[g>>2]|0}if((f|0)==1?(c[d+24>>2]|0)==0:0){f=ob(k,j)|0;if(f){n=f;i=m;return n|0}if((c[e+8>>2]|0)!=0?(n=ob(k,j)|0,(n|0)!=0):0){i=m;return n|0}}if((c[e+68>>2]|0)!=0?(o=nb(k,l)|0,(o|0)!=0):0){n=o;i=m;return n|0}n=jb(k,1)|0;c[a>>2]=n;n=(n|0)==-1&1;i=m;return n|0}function $a(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0;C=i;i=i+448|0;p=C+8|0;x=C+4|0;v=C;p=p+(0-p&15)|0;n=c[b+3376>>2]|0;j=c[e>>2]|0;c[x>>2]=0;y=b+1192|0;c[y>>2]=(c[y>>2]|0)+1;q=b+1200|0;c[q>>2]=0;o=b+12|0;c[v>>2]=(c[e+48>>2]|0)+(c[(c[o>>2]|0)+52>>2]|0);w=e+36|0;r=b+1212|0;s=e+52|0;t=e+56|0;u=e+60|0;z=e+4|0;l=e+44|0;h=b+1220|0;m=b+1172|0;B=b+1176|0;k=n+12|0;A=0;f=0;while(1){e=c[r>>2]|0;if((c[w>>2]|0)==0?(c[e+(j*216|0)+196>>2]|0)!=0:0){f=1;e=22;break}g=c[(c[o>>2]|0)+56>>2]|0;F=c[s>>2]|0;E=c[t>>2]|0;D=c[u>>2]|0;c[e+(j*216|0)+4>>2]=c[y>>2];c[e+(j*216|0)+8>>2]=F;c[e+(j*216|0)+12>>2]=E;c[e+(j*216|0)+16>>2]=D;c[e+(j*216|0)+24>>2]=g;e=c[z>>2]|0;if((e|0)!=2?!((e|0)==7|(f|0)!=0):0){f=nb(a,x)|0;if(f){e=22;break}e=c[x>>2]|0;if(e>>>0>((c[B>>2]|0)-j|0)>>>0){f=1;e=22;break}if(!e)f=0;else{id(k,0,164);c[n>>2]=0;f=1}}e=c[x>>2]|0;if(!e){f=bb(a,n,(c[r>>2]|0)+(j*216|0)|0,c[z>>2]|0,c[l>>2]|0)|0;if(!f)g=0;else{e=22;break}}else{c[x>>2]=e+-1;g=f}f=gb((c[r>>2]|0)+(j*216|0)|0,n,d,h,v,j,c[(c[o>>2]|0)+64>>2]|0,p)|0;if(f){e=22;break}A=((c[(c[r>>2]|0)+(j*216|0)+196>>2]|0)==1&1)+A|0;if(!(La(a)|0))e=(c[x>>2]|0)!=0;else e=1;f=c[z>>2]|0;if((f|0)==7|(f|0)==2)c[q>>2]=j;j=Ma(c[m>>2]|0,c[B>>2]|0,j)|0;if(!((j|0)!=0|e^1)){f=1;e=22;break}if(!e){e=20;break}else f=g}if((e|0)==20){e=b+1196|0;f=(c[e>>2]|0)+A|0;if(f>>>0>(c[B>>2]|0)>>>0){y=1;i=C;return y|0}c[e>>2]=f;y=0;i=C;return y|0}else if((e|0)==22){i=C;return f|0}return 0}function ab(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0;k=i;h=c[a+1192>>2]|0;d=c[a+1200>>2]|0;j=a+1212|0;a:do if(!d)d=b;else{e=a+16|0;f=0;do{do{d=d+-1|0;if(d>>>0<=b>>>0)break a}while((c[(c[j>>2]|0)+(d*216|0)+4>>2]|0)!=(h|0));f=f+1|0;g=c[(c[e>>2]|0)+52>>2]|0}while(f>>>0<(g>>>0>10?g:10)>>>0)}while(0);g=a+1172|0;b=a+1176|0;while(1){e=c[j>>2]|0;if((c[e+(d*216|0)+4>>2]|0)!=(h|0)){d=11;break}f=e+(d*216|0)+196|0;e=c[f>>2]|0;if(!e){d=11;break}c[f>>2]=e+-1;d=Ma(c[g>>2]|0,c[b>>2]|0,d)|0;if(!d){d=11;break}}if((d|0)==11){i=k;return}}function bb(a,d,e,f,g){a=a|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0;B=i;i=i+32|0;u=B+20|0;v=B+16|0;q=B+12|0;p=B+8|0;z=B+4|0;y=B;id(d,0,2088);l=nb(a,z)|0;m=c[z>>2]|0;do if((f|0)==2|(f|0)==7){m=m+6|0;if(m>>>0>31|(l|0)!=0){e=1;i=B;return e|0}else{c[d>>2]=m;o=m;break}}else{m=m+1|0;if(m>>>0>31|(l|0)!=0){e=1;i=B;return e|0}else{c[d>>2]=m;o=m;break}}while(0);a:do if((o|0)!=31){b:do if(o>>>0>=6){o=(o|0)!=6;p=o&1;if(!p){c[v>>2]=0;q=0;while(1){f=kb(a)|0;c[u>>2]=f;t=f>>>31;c[d+(q<<2)+12>>2]=t;if(!t){c[d+(q<<2)+76>>2]=f>>>28&7;m=f<<4;n=1}else{m=f<<1;n=0}f=q|1;t=m>>>31;c[d+(f<<2)+12>>2]=t;if(!t){c[d+(f<<2)+76>>2]=m>>>28&7;l=m<<4;n=n+1|0}else l=m<<1;m=f+1|0;t=l>>>31;c[d+(m<<2)+12>>2]=t;if(!t){c[d+(m<<2)+76>>2]=l>>>28&7;m=l<<4;n=n+1|0}else m=l<<1;l=q|3;t=m>>>31;c[d+(l<<2)+12>>2]=t;if(!t){c[d+(l<<2)+76>>2]=m>>>28&7;f=m<<4;n=n+1|0}else f=m<<1;m=l+1|0;t=f>>>31;c[d+(m<<2)+12>>2]=t;if(!t){c[d+(m<<2)+76>>2]=f>>>28&7;f=f<<4;n=n+1|0}else f=f<<1;m=l+2|0;t=f>>>31;c[d+(m<<2)+12>>2]=t;if(!t){c[d+(m<<2)+76>>2]=f>>>28&7;f=f<<4;n=n+1|0}else f=f<<1;m=l+3|0;t=f>>>31;c[d+(m<<2)+12>>2]=t;if(!t){c[d+(m<<2)+76>>2]=f>>>28&7;f=f<<4;n=n+1|0}else f=f<<1;m=q|7;t=f>>>31;c[d+(m<<2)+12>>2]=t;if(!t){c[d+(m<<2)+76>>2]=f>>>28&7;m=f<<4;n=n+1|0}else m=f<<1;c[u>>2]=m;if((lb(a,(n*3|0)+8|0)|0)==-1){w=1;t=68;break b}t=(c[v>>2]|0)+1|0;c[v>>2]=t;if((t|0)<2)q=q+8|0;else{t=52;break}}}else if((p|0)==1)t=52;if((t|0)==52){v=(nb(a,u)|0)!=0;l=c[u>>2]|0;if(v|l>>>0>3){w=1;t=68;break}c[d+140>>2]=l}if(o){v=c[d>>2]|0;s=v+-7|0;u=s>>>2;c[d+4>>2]=(s>>>0>11?u+268435453|0:u)<<4|(v>>>0>18?15:0)}else{x=p;t=70}}else{if((o|0)==0|(o|0)==1){r=v;s=u}else if(!((o|0)==3|(o|0)==2)){f=0;do{l=(nb(a,q)|0)!=0;m=c[q>>2]|0;if(l|m>>>0>3){n=1;t=96;break}c[d+(f<<2)+176>>2]=m;f=f+1|0}while(f>>>0<4);if((t|0)==96){i=B;return n|0}c:do if(g>>>0>1&(o|0)!=5){m=g>>>0>2&1;f=0;while(1){if(qb(a,q,m)|0){n=1;t=96;break}n=c[q>>2]|0;if(n>>>0>=g>>>0){n=1;t=96;break}c[d+(f<<2)+192>>2]=n;f=f+1|0;if(f>>>0>=4){h=0;break c}}if((t|0)==96){i=B;return n|0}}else h=0;while(0);d:while(1){n=c[d+(h<<2)+176>>2]|0;if(!n)n=0;else if((n|0)==2|(n|0)==1)n=1;else n=3;c[q>>2]=n;m=0;while(1){n=ob(a,p)|0;if(n){t=96;break d}b[d+(h<<4)+(m<<2)+208>>1]=c[p>>2];n=ob(a,p)|0;if(n){t=96;break d}b[d+(h<<4)+(m<<2)+210>>1]=c[p>>2];t=c[q>>2]|0;c[q>>2]=t+-1;if(!t)break;else m=m+1|0}h=h+1|0;if(h>>>0>=4){x=2;t=70;break b}}if((t|0)==96){i=B;return n|0}}else{r=v;s=u}if(g>>>0>1){if((o|0)==0|(o|0)==1)n=0;else if((o|0)==3|(o|0)==2)n=1;else n=3;l=g>>>0>2&1;f=0;while(1){if(qb(a,u,l)|0){w=1;t=68;break b}m=c[u>>2]|0;if(m>>>0>=g>>>0){w=1;t=68;break b}c[d+(f<<2)+144>>2]=m;if(!n)break;else{n=n+-1|0;f=f+1|0}}}if((o|0)==0|(o|0)==1){l=0;m=0}else if((o|0)==3|(o|0)==2){l=1;m=0}else{l=3;m=0}while(1){f=ob(a,v)|0;if(f){w=f;t=68;break b}b[d+(m<<2)+160>>1]=c[v>>2];f=ob(a,v)|0;if(f){w=f;t=68;break b}b[d+(m<<2)+162>>1]=c[v>>2];if(!l){x=2;t=70;break}else{l=l+-1|0;m=m+1|0}}}while(0);if((t|0)==68){e=w;i=B;return e|0}do if((t|0)==70){h=pb(a,z,(x|0)==0&1)|0;if(!h){z=c[z>>2]|0;c[d+4>>2]=z;if(!z)break a;else break}else{e=h;i=B;return e|0}}while(0);z=(ob(a,y)|0)!=0;h=c[y>>2]|0;if(z|(h|0)<-26|(h|0)>25){e=1;i=B;return e|0}c[d+8>>2]=h;l=c[d+4>>2]|0;o=d+272|0;e:do if((c[d>>2]|0)>>>0>=7){h=rb(a,d+1864|0,ib(e,0,o)|0,16)|0;if(!(h&15)){b[d+320>>1]=h>>>4&255;h=0;m=3;while(1){n=l>>>1;if(!(l&1))h=h+4|0;else{f=3;while(1){l=rb(a,d+(h<<6)+332|0,ib(e,h,o)|0,15)|0;c[d+(h<<2)+1992>>2]=l>>>15;if(l&15){j=l;break e}b[d+(h<<1)+272>>1]=l>>>4&255;h=h+1|0;if(!f)break;else f=f+-1|0}}if(!m){k=h;A=n;t=87;break}else{l=n;m=m+-1|0}}}else j=h}else{h=0;m=3;while(1){n=l>>>1;if(!(l&1))h=h+4|0;else{f=3;while(1){l=rb(a,d+(h<<6)+328|0,ib(e,h,o)|0,16)|0;c[d+(h<<2)+1992>>2]=l>>>16;if(l&15){j=l;break e}b[d+(h<<1)+272>>1]=l>>>4&255;h=h+1|0;if(!f)break;else f=f+-1|0}}if(!m){k=h;A=n;t=87;break}else{l=n;m=m+-1|0}}}while(0);f:do if((t|0)==87){if(A&3){j=rb(a,d+1928|0,-1,4)|0;if(j&15)break;b[d+322>>1]=j>>>4&255;j=rb(a,d+1944|0,-1,4)|0;if(j&15)break;b[d+324>>1]=j>>>4&255}if(!(A&2))j=0;else{h=7;while(1){j=rb(a,d+(k<<6)+332|0,ib(e,k,o)|0,15)|0;if(j&15)break f;b[d+(k<<1)+272>>1]=j>>>4&255;c[d+(k<<2)+1992>>2]=j>>>15;if(!h){j=0;break}else{k=k+1|0;h=h+-1|0}}}}while(0);c[a+16>>2]=((c[a+4>>2]|0)-(c[a>>2]|0)<<3)+(c[a+8>>2]|0);if(j){e=j;i=B;return e|0}}else{while(1){if(mb(a)|0)break;if(jb(a,1)|0){n=1;t=96;break}}if((t|0)==96){i=B;return n|0}k=0;j=d+328|0;while(1){h=jb(a,8)|0;c[z>>2]=h;if((h|0)==-1){n=1;break}c[j>>2]=h;k=k+1|0;if(k>>>0>=384)break a;else j=j+4|0}i=B;return n|0}while(0);e=0;i=B;return e|0}function cb(a){a=a|0;if(a>>>0<6)a=2;else a=(a|0)!=6&1;return a|0}function db(a){a=a|0;var b=0;b=i;if((a|0)==0|(a|0)==1)a=1;else if((a|0)==3|(a|0)==2)a=2;else a=4;i=b;return a|0}function eb(a){a=a|0;var b=0;b=i;if(!a)a=1;else if((a|0)==2|(a|0)==1)a=2;else a=4;i=b;return a|0}function fb(a){a=a|0;return a+1&3|0}function gb(d,e,f,g,h,j,k,l){d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;l=l|0;var m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;v=i;s=c[e>>2]|0;c[d>>2]=s;o=d+196|0;c[o>>2]=(c[o>>2]|0)+1;Na(f,j);if((s|0)==31){m=d+28|0;c[d+20>>2]=0;if((c[o>>2]|0)>>>0>1){b[m>>1]=16;b[d+30>>1]=16;b[d+32>>1]=16;b[d+34>>1]=16;b[d+36>>1]=16;b[d+38>>1]=16;b[d+40>>1]=16;b[d+42>>1]=16;b[d+44>>1]=16;b[d+46>>1]=16;b[d+48>>1]=16;b[d+50>>1]=16;b[d+52>>1]=16;b[d+54>>1]=16;b[d+56>>1]=16;b[d+58>>1]=16;b[d+60>>1]=16;b[d+62>>1]=16;b[d+64>>1]=16;b[d+66>>1]=16;b[d+68>>1]=16;b[d+70>>1]=16;b[d+72>>1]=16;b[d+74>>1]=16;t=0;i=v;return t|0}o=23;h=e+328|0;n=l;while(1){b[m>>1]=16;a[n>>0]=c[h>>2];a[n+1>>0]=c[h+4>>2];a[n+2>>0]=c[h+8>>2];a[n+3>>0]=c[h+12>>2];a[n+4>>0]=c[h+16>>2];a[n+5>>0]=c[h+20>>2];a[n+6>>0]=c[h+24>>2];a[n+7>>0]=c[h+28>>2];a[n+8>>0]=c[h+32>>2];a[n+9>>0]=c[h+36>>2];a[n+10>>0]=c[h+40>>2];a[n+11>>0]=c[h+44>>2];a[n+12>>0]=c[h+48>>2];a[n+13>>0]=c[h+52>>2];a[n+14>>0]=c[h+56>>2];a[n+15>>0]=c[h+60>>2];if(!o)break;else{o=o+-1|0;h=h+64|0;n=n+16|0;m=m+2|0}}sc(f,l);t=0;i=v;return t|0}m=d+28|0;if(s){hd(m,e+272|0,54);n=c[e+8>>2]|0;o=c[h>>2]|0;do if(n){o=o+n|0;c[h>>2]=o;if((o|0)<0){o=o+52|0;c[h>>2]=o;break}if((o|0)>51){o=o+-52|0;c[h>>2]=o}}while(0);r=d+20|0;c[r>>2]=o;n=e+328|0;h=e+1992|0;a:do if((c[d>>2]|0)>>>0<7){q=15;o=m;while(1){if(b[o>>1]|0){if(Ga(n,c[r>>2]|0,0,c[h>>2]|0)|0){m=1;break}}else c[n>>2]=16777215;n=n+64|0;o=o+2|0;h=h+4|0;if(!q)break a;else q=q+-1|0}i=v;return m|0}else{if(!(b[d+76>>1]|0)){q=464;p=15;o=m}else{Ha(e+1864|0,o);q=464;p=15;o=m}while(1){m=c[e+(c[q>>2]<<2)+1864>>2]|0;q=q+4|0;c[n>>2]=m;if((m|0)==0?(b[o>>1]|0)==0:0)c[n>>2]=16777215;else u=18;if((u|0)==18?(u=0,(Ga(n,c[r>>2]|0,1,c[h>>2]|0)|0)!=0):0){m=1;break}n=n+64|0;o=o+2|0;h=h+4|0;if(!p)break a;else p=p+-1|0}i=v;return m|0}while(0);q=c[192+((Oa(0,51,(c[d+24>>2]|0)+(c[r>>2]|0)|0)|0)<<2)>>2]|0;if((b[d+78>>1]|0)==0?(b[d+80>>1]|0)==0:0){p=e+1928|0;m=7}else{p=e+1928|0;Ia(p,q);m=7}while(1){r=c[p>>2]|0;p=p+4|0;c[n>>2]=r;if((r|0)==0?(b[o>>1]|0)==0:0)c[n>>2]=16777215;else u=31;if((u|0)==31?(u=0,(Ga(n,q,1,c[h>>2]|0)|0)!=0):0){m=1;u=39;break}if(!m)break;else{n=n+64|0;h=h+4|0;m=m+-1|0;o=o+2|0}}if((u|0)==39){i=v;return m|0}if(s>>>0>=6){o=Mb(d,e,f,j,k,l)|0;if(o){t=o;i=v;return t|0}}else u=37}else{id(m,0,54);c[d+20>>2]=c[h>>2];u=37}if((u|0)==37?(t=Sb(d,e,g,j,f,l)|0,(t|0)!=0):0){i=v;return t|0}t=0;i=v;return t|0}function hb(a){a=a|0;return a|0}function ib(d,e,f){d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0;k=i;l=vb(e)|0;g=wb(e)|0;h=a[l+4>>0]|0;j=a[g+4>>0]|0;g=(c[g>>2]|0)==4;if((c[l>>2]|0)==4){e=b[f+((h&255)<<1)>>1]|0;if(g){e=e+1+(b[f+((j&255)<<1)>>1]|0)>>1;i=k;return e|0}g=d+204|0;if(!(zb(d,c[g>>2]|0)|0)){i=k;return e|0}e=e+1+(b[(c[g>>2]|0)+((j&255)<<1)+28>>1]|0)>>1;i=k;return e|0}if(g){e=b[f+((j&255)<<1)>>1]|0;g=d+200|0;if(!(zb(d,c[g>>2]|0)|0)){i=k;return e|0}e=e+1+(b[(c[g>>2]|0)+((h&255)<<1)+28>>1]|0)>>1;i=k;return e|0}g=d+200|0;if(!(zb(d,c[g>>2]|0)|0)){h=0;f=0}else{h=b[(c[g>>2]|0)+((h&255)<<1)+28>>1]|0;f=1}g=d+204|0;if(!(zb(d,c[g>>2]|0)|0)){e=h;i=k;return e|0}e=b[(c[g>>2]|0)+((j&255)<<1)+28>>1]|0;if(!f){i=k;return e|0}e=h+1+e>>1;i=k;return e|0}function jb(a,b){a=a|0;b=b|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0;p=i;n=a+4|0;j=c[n>>2]|0;m=c[a+12>>2]<<3;o=a+16|0;l=c[o>>2]|0;g=m-l|0;if((g|0)>31){e=a+8|0;g=c[e>>2]|0;f=(d[j+1>>0]|0)<<16|(d[j>>0]|0)<<24|(d[j+2>>0]|0)<<8|(d[j+3>>0]|0);if(!g)h=e;else{h=e;f=(d[j+4>>0]|0)>>>(8-g|0)|f<<g}}else{h=a+8|0;if((g|0)>0){e=c[h>>2]|0;k=e+24|0;f=(d[j>>0]|0)<<k;g=g+-8+e|0;if((g|0)>0){e=g;g=k;do{j=j+1|0;g=g+-8|0;f=(d[j>>0]|0)<<g|f;e=e+-8|0}while((e|0)>0)}}else f=0}e=l+b|0;c[o>>2]=e;c[h>>2]=e&7;if(e>>>0>m>>>0){n=-1;i=p;return n|0}c[n>>2]=(c[a>>2]|0)+(e>>>3);n=f>>>(32-b|0);i=p;return n|0}function kb(a){a=a|0;var b=0,e=0,f=0,g=0,h=0;g=i;f=c[a+4>>2]|0;e=(c[a+12>>2]<<3)-(c[a+16>>2]|0)|0;if((e|0)>31){b=c[a+8>>2]|0;a=(d[f+1>>0]|0)<<16|(d[f>>0]|0)<<24|(d[f+2>>0]|0)<<8|(d[f+3>>0]|0);if(!b){b=a;i=g;return b|0}b=(d[f+4>>0]|0)>>>(8-b|0)|a<<b;i=g;return b|0}if((e|0)<=0){b=0;i=g;return b|0}h=c[a+8>>2]|0;a=h+24|0;b=(d[f>>0]|0)<<a;e=e+-8+h|0;if((e|0)<=0){i=g;return b|0}do{f=f+1|0;a=a+-8|0;b=(d[f>>0]|0)<<a|b;e=e+-8|0}while((e|0)>0);i=g;return b|0}function lb(a,b){a=a|0;b=b|0;var d=0,e=0;d=i;e=a+16|0;b=(c[e>>2]|0)+b|0;c[e>>2]=b;c[a+8>>2]=b&7;if(b>>>0>c[a+12>>2]<<3>>>0){b=-1;i=d;return b|0}c[a+4>>2]=(c[a>>2]|0)+(b>>>3);b=0;i=d;return b|0}function mb(a){a=a|0;return (c[a+8>>2]|0)==0|0}function nb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0;g=i;d=kb(a)|0;do if((d|0)>=0){if(d>>>0>1073741823){if((lb(a,3)|0)==-1){d=1;break}c[b>>2]=(d>>>29&1)+1;d=0;break}if(d>>>0>536870911){if((lb(a,5)|0)==-1){d=1;break}c[b>>2]=(d>>>27&3)+3;d=0;break}if(d>>>0>268435455){if((lb(a,7)|0)==-1){d=1;break}c[b>>2]=(d>>>25&7)+7;d=0;break}d=Ja(d,28)|0;e=d+4|0;if((e|0)!=32){lb(a,d+5|0)|0;d=jb(a,e)|0;if((d|0)==-1){d=1;break}c[b>>2]=(1<<e)+-1+d;d=0;break}c[b>>2]=0;lb(a,32)|0;if((jb(a,1)|0)==1?(f=kb(a)|0,(lb(a,32)|0)!=-1):0)if((f|0)==1){c[b>>2]=-1;d=1;break}else if(!f){c[b>>2]=-1;d=0;break}else{d=1;break}else d=1}else{lb(a,1)|0;c[b>>2]=0;d=0}while(0);i=g;return d|0}function ob(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;e=i;i=i+16|0;f=e;c[f>>2]=0;d=nb(a,f)|0;a=c[f>>2]|0;d=(d|0)==0;if((a|0)==-1)if(d)a=1;else{c[b>>2]=-2147483648;a=0}else if(d){d=(a+1|0)>>>1;c[b>>2]=(a&1|0)!=0?d:0-d|0;a=0}else a=1;i=e;return a|0}function pb(a,b,e){a=a|0;b=b|0;e=e|0;var f=0,g=0;g=i;i=i+16|0;f=g;if(nb(a,f)|0){f=1;i=g;return f|0}f=c[f>>2]|0;if(f>>>0>47){f=1;i=g;return f|0}c[b>>2]=d[((e|0)==0?576:528)+f>>0];f=0;i=g;return f|0}function qb(a,b,d){a=a|0;b=b|0;d=d|0;var e=0;e=i;if(!d){d=jb(a,1)|0;c[b>>2]=d;if((d|0)==-1)d=1;else{c[b>>2]=d^1;d=0}}else d=nb(a,b)|0;i=e;return d|0}function rb(a,b,f,g){a=a|0;b=b|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0,O=0;O=i;i=i+128|0;M=O+64|0;N=O;n=kb(a)|0;p=n>>>16;do if(f>>>0<2)if((n|0)>=0){if(n>>>0>201326591){o=e[1264+(n>>>26<<1)>>1]|0;k=25;break}if(n>>>0>16777215){o=e[1328+(n>>>22<<1)>>1]|0;k=25;break}if(n>>>0>2097151){o=e[1424+((n>>>18)+-8<<1)>>1]|0;k=25;break}else{o=e[1536+(p<<1)>>1]|0;k=25;break}}else q=1;else if(f>>>0<4){if((n|0)<0){q=(p&16384|0)!=0?2:2082;break}if(n>>>0>268435455){o=e[1600+(n>>>26<<1)>>1]|0;k=25;break}if(n>>>0>33554431){o=e[1664+(n>>>23<<1)>>1]|0;k=25;break}else{o=e[1728+(n>>>18<<1)>>1]|0;k=25;break}}else{if(f>>>0<8){f=n>>>26;if((f+-8|0)>>>0<56){o=e[1984+(f<<1)>>1]|0;k=25;break}o=e[2112+(n>>>22<<1)>>1]|0;k=25;break}if(f>>>0<17){o=e[2368+(n>>>26<<1)>>1]|0;k=25;break}f=n>>>29;if(f){o=e[2496+(f<<1)>>1]|0;k=25;break}o=e[2512+(n>>>24<<1)>>1]|0;k=25;break}while(0);if((k|0)==25)if(!o){C=1;i=O;return C|0}else q=o;o=q&31;f=n<<o;p=32-o|0;I=q>>>11&31;if(I>>>0>g>>>0){C=1;i=O;return C|0}v=q>>>5&63;do if(I){if(!v)o=0;else{do if(p>>>0<v>>>0)if((lb(a,o)|0)==-1){C=1;i=O;return C|0}else{p=32;f=kb(a)|0;break}while(0);n=f>>>(32-v|0);f=f<<v;k=0;o=1<<v+-1;do{c[M+(k<<2)>>2]=(o&n|0)!=0?-1:1;o=o>>>1;k=k+1|0}while((o|0)!=0);p=p-v|0;o=k}u=v>>>0<3;a:do if(o>>>0<I>>>0){t=o;s=I>>>0>10&u&1;b:while(1){if(p>>>0<16){if((lb(a,32-p|0)|0)==-1){J=1;k=127;break}r=32;f=kb(a)|0}else r=p;do if((f|0)>=0)if(f>>>0<=1073741823)if(f>>>0<=536870911)if(f>>>0<=268435455)if(f>>>0<=134217727)if(f>>>0<=67108863)if(f>>>0<=33554431)if(f>>>0<=16777215)if(f>>>0<=8388607)if(f>>>0>4194303){H=9;k=59}else{if(f>>>0>2097151){H=10;k=59;break}if(f>>>0>1048575){H=11;k=59;break}if(f>>>0>524287){H=12;k=59;break}if(f>>>0>262143){H=13;k=59;break}if(f>>>0>131071){p=14;o=f<<15;n=r+-15|0;q=s;k=(s|0)!=0?s:4}else{if(f>>>0<65536){J=1;k=127;break b}p=15;o=f<<16;n=r+-16|0;q=(s|0)!=0?s:1;k=12}G=p<<q;B=o;y=n;z=q;x=k;w=(q|0)==0;k=60}else{H=8;k=59}else{H=7;k=59}else{H=6;k=59}else{H=5;k=59}else{H=4;k=59}else{H=3;k=59}else{H=2;k=59}else{H=1;k=59}else{H=0;k=59}while(0);if((k|0)==59){k=0;p=H+1|0;o=f<<p;p=r-p|0;f=H<<s;if(!s){E=p;F=o;A=f;C=0;D=1}else{G=f;B=o;y=p;z=s;x=s;w=0;k=60}}if((k|0)==60){if(y>>>0<x>>>0){if((lb(a,32-y|0)|0)==-1){J=1;k=127;break}o=32;f=kb(a)|0}else{o=y;f=B}E=o-x|0;F=f<<x;A=(f>>>(32-x|0))+G|0;C=z;D=w}s=(t|0)==(v|0)&u?A+2|0:A;o=(s+2|0)>>>1;n=D?1:C;c[M+(t<<2)>>2]=(s&1|0)==0?o:0-o|0;t=t+1|0;if(t>>>0>=I>>>0){l=E;m=F;break a}else{p=E;f=F;s=((o|0)>(3<<n+-1|0)&n>>>0<6&1)+n|0}}if((k|0)==127){i=O;return J|0}}else{l=p;m=f}while(0);if(I>>>0<g>>>0){do if(l>>>0<9)if((lb(a,32-l|0)|0)==-1){C=1;i=O;return C|0}else{l=32;m=kb(a)|0;break}while(0);k=m>>>23;c:do if((g|0)==4)if((m|0)>=0)if((I|0)!=3)if(m>>>0<=1073741823)if((I|0)==2)k=34;else k=m>>>0>536870911?35:51;else k=18;else k=17;else k=1;else{do switch(I|0){case 8:{k=d[1056+(m>>>26)>>0]|0;break}case 9:{k=d[1120+(m>>>26)>>0]|0;break}case 2:{k=d[736+(m>>>26)>>0]|0;break}case 1:{if(m>>>0>268435455)k=d[672+(m>>>27)>>0]|0;else k=d[704+k>>0]|0;break}case 13:{k=d[1248+(m>>>29)>>0]|0;break}case 14:{k=d[1256+(m>>>30)>>0]|0;break}case 3:{k=d[800+(m>>>26)>>0]|0;break}case 4:{k=d[864+(m>>>27)>>0]|0;break}case 5:{k=d[896+(m>>>27)>>0]|0;break}case 10:{k=d[1184+(m>>>27)>>0]|0;break}case 6:{k=d[928+(m>>>26)>>0]|0;break}case 7:{k=d[992+(m>>>26)>>0]|0;break}case 11:{k=d[1216+(m>>>28)>>0]|0;break}case 12:{k=d[1232+(m>>>28)>>0]|0;break}default:{k=m>>31&16|1;break c}}while(0);if(!k){C=1;i=O;return C|0}}while(0);n=k&15;l=l-n|0;m=m<<n;n=k>>>4&15}else n=0;p=I+-1|0;f=(p|0)==0;if(f){c[b+(n<<2)>>2]=c[M+(p<<2)>>2];K=l;h=1<<n;break}else{k=m;o=0}d:while(1){if(!n){c[N+(o<<2)>>2]=1;L=l;j=0}else{if(l>>>0<11){if((lb(a,32-l|0)|0)==-1){J=1;k=127;break}l=32;k=kb(a)|0}switch(n|0){case 4:{m=d[648+(k>>>29)>>0]|0;break}case 5:{m=d[656+(k>>>29)>>0]|0;break}case 6:{m=d[664+(k>>>29)>>0]|0;break}case 1:{m=d[624+(k>>>31)>>0]|0;break}case 2:{m=d[632+(k>>>30)>>0]|0;break}case 3:{m=d[640+(k>>>30)>>0]|0;break}default:{do if(k>>>0<=536870911)if(k>>>0<=268435455)if(k>>>0<=134217727)if(k>>>0<=67108863)if(k>>>0<=33554431)if(k>>>0>16777215)m=184;else{if(k>>>0>8388607){m=201;break}if(k>>>0>4194303){m=218;break}m=k>>>0<2097152?0:235}else m=167;else m=150;else m=133;else m=116;else m=k>>>29<<4^115;while(0);if((m>>>4&15)>>>0>n>>>0){J=1;k=127;break d}}}if(!m){J=1;k=127;break}C=m&15;j=m>>>4&15;c[N+(o<<2)>>2]=j+1;L=l-C|0;k=k<<C;j=n-j|0}o=o+1|0;if(o>>>0>=p>>>0){k=122;break}else{l=L;n=j}}if((k|0)==122){c[b+(j<<2)>>2]=c[M+(p<<2)>>2];h=1<<j;if(f){K=L;break}k=I+-2|0;while(1){j=(c[N+(k<<2)>>2]|0)+j|0;h=1<<j|h;c[b+(j<<2)>>2]=c[M+(k<<2)>>2];if(!k){K=L;break}else k=k+-1|0}}else if((k|0)==127){i=O;return J|0}}else{K=p;h=0}while(0);if(lb(a,32-K|0)|0){C=1;i=O;return C|0}C=h<<16|I<<4;i=O;return C|0}function sb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;f=i;a:do if((jb(a,1)|0)!=-1?(e=b+4|0,c[e>>2]=jb(a,2)|0,d=jb(a,5)|0,c[b>>2]=d,(d+-2|0)>>>0>=3):0){switch(d|0){case 6:case 9:case 10:case 11:case 12:{if(c[e>>2]|0){d=1;break a}break}case 5:case 7:case 8:{if(!(c[e>>2]|0)){d=1;break a}switch(d|0){case 6:case 9:case 10:case 11:case 12:{d=1;break a}default:{}}break}default:{}}d=0}else d=1;while(0);i=f;return d|0}function tb(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0;o=i;if(!d){i=o;return}m=b+-1|0;j=1-b|0;k=~b;g=0;h=0;l=0;while(1){f=(g|0)!=0;if(f)c[a+(h*216|0)+200>>2]=a+((h+-1|0)*216|0);else c[a+(h*216|0)+200>>2]=0;e=(l|0)!=0;if(e){c[a+(h*216|0)+204>>2]=a+((h-b|0)*216|0);if(g>>>0<m>>>0)c[a+(h*216|0)+208>>2]=a+((j+h|0)*216|0);else n=10}else{c[a+(h*216|0)+204>>2]=0;n=10}if((n|0)==10){n=0;c[a+(h*216|0)+208>>2]=0}if(e&f)c[a+(h*216|0)+212>>2]=a+((h+k|0)*216|0);else c[a+(h*216|0)+212>>2]=0;e=g+1|0;f=(e|0)==(b|0);h=h+1|0;if((h|0)==(d|0))break;else{g=f?0:e;l=(f&1)+l|0}}i=o;return}function ub(a,b){a=a|0;b=b|0;var d=0;d=i;switch(b|0){case 1:{a=c[a+204>>2]|0;break}case 3:{a=c[a+212>>2]|0;break}case 4:break;case 2:{a=c[a+208>>2]|0;break}case 0:{a=c[a+200>>2]|0;break}default:a=0}i=d;return a|0}function vb(a){a=a|0;return 3152+(a<<3)|0}function wb(a){a=a|0;return 2960+(a<<3)|0}function xb(a){a=a|0;return 2768+(a<<3)|0}function yb(a){a=a|0;return 2576+(a<<3)|0}function zb(a,b){a=a|0;b=b|0;var d=0;d=i;if(!b){i=d;return 0}else{i=d;return (c[a+4>>2]|0)==(c[b+4>>2]|0)|0}return 0}function Ab(a){a=a|0;var b=0;b=i;id(a,0,3388);c[a+8>>2]=32;c[a+4>>2]=256;c[a+1332>>2]=1;i=b;return}function Bb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0;h=i;f=c[b+8>>2]|0;g=a+(f<<2)+20|0;e=c[g>>2]|0;do if(!e){d=fd(92)|0;c[g>>2]=d;if(!d){d=65535;i=h;return d|0}}else{d=a+8|0;if((f|0)!=(c[d>>2]|0)){gd(c[e+40>>2]|0);c[(c[g>>2]|0)+40>>2]=0;gd(c[(c[g>>2]|0)+84>>2]|0);c[(c[g>>2]|0)+84>>2]=0;break}f=a+16|0;if(Ra(b,c[f>>2]|0)|0){gd(c[(c[g>>2]|0)+40>>2]|0);c[(c[g>>2]|0)+40>>2]=0;gd(c[(c[g>>2]|0)+84>>2]|0);c[(c[g>>2]|0)+84>>2]=0;c[d>>2]=33;c[a+4>>2]=257;c[f>>2]=0;c[a+12>>2]=0;break}d=b+40|0;gd(c[d>>2]|0);c[d>>2]=0;d=b+84|0;gd(c[d>>2]|0);c[d>>2]=0;d=0;i=h;return d|0}while(0);f=(c[g>>2]|0)+0|0;d=b+0|0;e=f+92|0;do{c[f>>2]=c[d>>2];f=f+4|0;d=d+4|0}while((f|0)<(e|0));d=0;i=h;return d|0}function Cb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0;h=i;f=c[b>>2]|0;g=a+(f<<2)+148|0;d=c[g>>2]|0;do if(!d){d=fd(72)|0;c[g>>2]=d;if(!d){d=65535;i=h;return d|0}}else{e=a+4|0;if((f|0)!=(c[e>>2]|0)){gd(c[d+20>>2]|0);c[(c[g>>2]|0)+20>>2]=0;gd(c[(c[g>>2]|0)+24>>2]|0);c[(c[g>>2]|0)+24>>2]=0;gd(c[(c[g>>2]|0)+28>>2]|0);c[(c[g>>2]|0)+28>>2]=0;gd(c[(c[g>>2]|0)+44>>2]|0);c[(c[g>>2]|0)+44>>2]=0;break}if((c[b+4>>2]|0)!=(c[a+8>>2]|0)){c[e>>2]=257;d=c[g>>2]|0}gd(c[d+20>>2]|0);c[(c[g>>2]|0)+20>>2]=0;gd(c[(c[g>>2]|0)+24>>2]|0);c[(c[g>>2]|0)+24>>2]=0;gd(c[(c[g>>2]|0)+28>>2]|0);c[(c[g>>2]|0)+28>>2]=0;gd(c[(c[g>>2]|0)+44>>2]|0);c[(c[g>>2]|0)+44>>2]=0}while(0);f=(c[g>>2]|0)+0|0;d=b+0|0;e=f+72|0;do{c[f>>2]=c[d>>2];f=f+4|0;d=d+4|0}while((f|0)<(e|0));d=0;i=h;return d|0}function Db(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;q=i;o=a+(b<<2)+148|0;f=c[o>>2]|0;if(!f){o=1;i=q;return o|0}n=c[f+4>>2]|0;g=c[a+(n<<2)+20>>2]|0;if(!g){o=1;i=q;return o|0}l=c[g+52>>2]|0;m=Z(c[g+56>>2]|0,l)|0;h=c[f+12>>2]|0;a:do if(h>>>0>1){g=c[f+16>>2]|0;if((g|0)==2){k=c[f+24>>2]|0;j=c[f+28>>2]|0;h=h+-1|0;e=0;while(1){f=c[k+(e<<2)>>2]|0;g=c[j+(e<<2)>>2]|0;if(!(f>>>0<=g>>>0&g>>>0<m>>>0)){e=1;g=33;break}e=e+1|0;if(((f>>>0)%(l>>>0)|0)>>>0>((g>>>0)%(l>>>0)|0)>>>0){e=1;g=33;break}if(e>>>0>=h>>>0)break a}if((g|0)==33){i=q;return e|0}}else if(!g){g=c[f+20>>2]|0;f=0;while(1){if((c[g+(f<<2)>>2]|0)>>>0>m>>>0){e=1;break}f=f+1|0;if(f>>>0>=h>>>0)break a}i=q;return e|0}else{if((g+-3|0)>>>0<3){if((c[f+36>>2]|0)>>>0>m>>>0)e=1;else break;i=q;return e|0}if((g|0)!=6)break;if((c[f+40>>2]|0)>>>0<m>>>0)e=1;else break;i=q;return e|0}}while(0);f=a+4|0;g=c[f>>2]|0;do if((g|0)!=256){e=a+3380|0;if(!(c[e>>2]|0)){if((g|0)==(b|0))break;g=a+8|0;if((n|0)==(c[g>>2]|0)){c[f>>2]=b;c[a+12>>2]=c[o>>2];break}if(!d){o=1;i=q;return o|0}else{c[f>>2]=b;o=c[o>>2]|0;c[a+12>>2]=o;o=c[o+4>>2]|0;c[g>>2]=o;o=c[a+(o<<2)+20>>2]|0;c[a+16>>2]=o;n=c[o+52>>2]|0;o=c[o+56>>2]|0;c[a+1176>>2]=Z(o,n)|0;c[a+1340>>2]=n;c[a+1344>>2]=o;c[e>>2]=1;break}}c[e>>2]=0;e=a+1212|0;gd(c[e>>2]|0);c[e>>2]=0;f=a+1172|0;gd(c[f>>2]|0);c[f>>2]=0;g=a+1176|0;c[e>>2]=fd((c[g>>2]|0)*216|0)|0;o=fd(c[g>>2]<<2)|0;c[f>>2]=o;f=c[e>>2]|0;if((f|0)==0|(o|0)==0){o=65535;i=q;return o|0}id(f,0,(c[g>>2]|0)*216|0);f=a+16|0;tb(c[e>>2]|0,c[(c[f>>2]|0)+52>>2]|0,c[g>>2]|0);f=c[f>>2]|0;do if((c[a+1216>>2]|0)==0?(c[f+16>>2]|0)!=2:0){if(((c[f+80>>2]|0)!=0?(p=c[f+84>>2]|0,(c[p+920>>2]|0)!=0):0)?(c[p+944>>2]|0)==0:0){e=1;break}e=0}else e=1;while(0);o=Z(c[f+56>>2]|0,c[f+52>>2]|0)|0;e=lc(a+1220|0,o,c[f+88>>2]|0,c[f+44>>2]|0,c[f+12>>2]|0,e)|0;if(e){o=e;i=q;return o|0}}else{c[f>>2]=b;o=c[o>>2]|0;c[a+12>>2]=o;o=c[o+4>>2]|0;c[a+8>>2]=o;o=c[a+(o<<2)+20>>2]|0;c[a+16>>2]=o;n=c[o+52>>2]|0;o=c[o+56>>2]|0;c[a+1176>>2]=Z(o,n)|0;c[a+1340>>2]=n;c[a+1344>>2]=o;c[a+3380>>2]=1}while(0);o=0;i=q;return o|0}function Eb(a){a=a|0;var b=0,d=0,e=0;e=i;c[a+1196>>2]=0;c[a+1192>>2]=0;d=c[a+1176>>2]|0;if(!d){i=e;return}a=c[a+1212>>2]|0;b=0;do{c[a+(b*216|0)+4>>2]=0;c[a+(b*216|0)+196>>2]=0;b=b+1|0}while(b>>>0<d>>>0);i=e;return}function Fb(a){a=a|0;return (c[a+1188>>2]|0)==0|0}function Gb(a){a=a|0;var b=0,d=0,e=0,f=0;f=i;if(!(c[a+1404>>2]|0)){if((c[a+1196>>2]|0)==(c[a+1176>>2]|0)){a=1;i=f;return a|0}}else{e=c[a+1176>>2]|0;if(!e){a=1;i=f;return a|0}a=c[a+1212>>2]|0;b=0;d=0;do{d=((c[a+(b*216|0)+196>>2]|0)!=0&1)+d|0;b=b+1|0}while(b>>>0<e>>>0);if((d|0)==(e|0)){a=1;i=f;return a|0}}a=0;i=f;return a|0}function Hb(a,b){a=a|0;b=b|0;var d=0,e=0;d=i;e=c[a+16>>2]|0;Kb(c[a+1172>>2]|0,c[a+12>>2]|0,b,c[e+52>>2]|0,c[e+56>>2]|0);i=d;return}function Ib(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0;t=i;i=i+32|0;g=t+24|0;j=t+20|0;k=t+16|0;n=t+12|0;r=t+8|0;q=t;c[e>>2]=0;switch(c[b>>2]|0){case 5:case 1:{s=d+1300|0;h=d+1332|0;if(c[h>>2]|0){c[e>>2]=1;c[h>>2]=0}h=Ua(a,g)|0;if(h){o=h;i=t;return o|0}l=c[d+(c[g>>2]<<2)+148>>2]|0;if(!l){o=65520;i=t;return o|0}h=c[l+4>>2]|0;m=c[d+(h<<2)+20>>2]|0;if(!m){o=65520;i=t;return o|0}g=c[d+8>>2]|0;if(!((g|0)==32|(h|0)==(g|0))?(c[b>>2]|0)!=5:0){o=65520;i=t;return o|0}g=c[d+1304>>2]|0;h=c[b+4>>2]|0;if((g|0)!=(h|0)?(g|0)==0|(h|0)==0:0)c[e>>2]=1;h=(c[b>>2]|0)==5;if((c[s>>2]|0)==5){if(!h)f=16}else if(h)f=16;if((f|0)==16)c[e>>2]=1;g=m+12|0;if(Va(a,c[g>>2]|0,j)|0){o=1;i=t;return o|0}f=d+1308|0;h=c[j>>2]|0;if((c[f>>2]|0)!=(h|0)){c[f>>2]=h;c[e>>2]=1}if((c[b>>2]|0)==5){if(Wa(a,c[g>>2]|0,5,k)|0){o=1;i=t;return o|0}if((c[s>>2]|0)==5){h=d+1312|0;f=c[h>>2]|0;g=c[k>>2]|0;if((f|0)==(g|0))g=f;else c[e>>2]=1}else{g=c[k>>2]|0;h=d+1312|0}c[h>>2]=g}g=c[m+16>>2]|0;if((g|0)==1){if(!(c[m+24>>2]|0)){h=l+8|0;g=Za(a,m,c[b>>2]|0,c[h>>2]|0,q)|0;if(g){o=g;i=t;return o|0}f=d+1324|0;g=c[q>>2]|0;if((c[f>>2]|0)!=(g|0)){c[f>>2]=g;c[e>>2]=1}if((c[h>>2]|0)!=0?(p=d+1328|0,o=c[q+4>>2]|0,(c[p>>2]|0)!=(o|0)):0){c[p>>2]=o;c[e>>2]=1}}}else if(!g){if(Xa(a,m,c[b>>2]|0,n)|0){o=1;i=t;return o|0}f=d+1316|0;g=c[n>>2]|0;if((c[f>>2]|0)!=(g|0)){c[f>>2]=g;c[e>>2]=1}if(c[l+8>>2]|0){f=Ya(a,m,c[b>>2]|0,r)|0;if(f){o=f;i=t;return o|0}g=d+1320|0;f=c[r>>2]|0;if((c[g>>2]|0)!=(f|0)){c[g>>2]=f;c[e>>2]=1}}}n=b;a=c[n+4>>2]|0;o=s;c[o>>2]=c[n>>2];c[o+4>>2]=a;o=0;i=t;return o|0}case 6:case 7:case 8:case 9:case 10:case 11:case 13:case 14:case 15:case 16:case 17:case 18:{c[e>>2]=1;o=0;i=t;return o|0}default:{o=0;i=t;return o|0}}return 0}function Jb(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0;n=i;l=0;a:while(1){b=c[a+(l<<2)+148>>2]|0;b:do if((b|0)!=0?(k=c[a+(c[b+4>>2]<<2)+20>>2]|0,(k|0)!=0):0){j=c[k+52>>2]|0;m=Z(c[k+56>>2]|0,j)|0;f=c[b+12>>2]|0;if(f>>>0<=1){b=0;d=18;break a}d=c[b+16>>2]|0;if((d|0)==2){h=c[b+24>>2]|0;g=c[b+28>>2]|0;f=f+-1|0;e=0;while(1){b=c[h+(e<<2)>>2]|0;d=c[g+(e<<2)>>2]|0;if(!(b>>>0<=d>>>0&d>>>0<m>>>0))break b;e=e+1|0;if(((b>>>0)%(j>>>0)|0)>>>0>((d>>>0)%(j>>>0)|0)>>>0)break b;if(e>>>0>=f>>>0){b=0;d=18;break a}}}else if(d){if((d+-3|0)>>>0<3)if((c[b+36>>2]|0)>>>0>m>>>0)break;else{b=0;d=18;break a}if((d|0)!=6){b=0;d=18;break a}if((c[b+40>>2]|0)>>>0<m>>>0)break;else{b=0;d=18;break a}}else{d=c[b+20>>2]|0;b=0;while(1){if((c[d+(b<<2)>>2]|0)>>>0>m>>>0)break b;b=b+1|0;if(b>>>0>=f>>>0){b=0;d=18;break a}}}}while(0);l=l+1|0;if(l>>>0>=256){b=1;d=18;break}}if((d|0)==18){i=n;return b|0}return 0}function Kb(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;v=i;t=Z(f,e)|0;o=c[b+12>>2]|0;if((o|0)==1){id(a,0,t<<2);i=v;return}k=c[b+16>>2]|0;if((k+-3|0)>>>0<3){d=Z(c[b+36>>2]|0,d)|0;d=d>>>0<t>>>0?d:t;if((k&-2|0)==4){n=(c[b+32>>2]|0)==0?d:t-d|0;u=d}else{n=0;u=d}}else{n=0;u=0}switch(k|0){case 0:{l=c[b+20>>2]|0;if(!t){i=v;return}else{h=0;j=0}while(1){while(1)if(h>>>0<o>>>0)break;else h=0;b=l+(h<<2)|0;d=c[b>>2]|0;a:do if(!d)d=0;else{k=0;do{g=k+j|0;if(g>>>0>=t>>>0)break a;c[a+(g<<2)>>2]=h;k=k+1|0;d=c[b>>2]|0}while(k>>>0<d>>>0)}while(0);j=d+j|0;if(j>>>0>=t>>>0)break;else h=h+1|0}i=v;return}case 4:{h=c[b+32>>2]|0;if(!t){i=v;return}d=1-h|0;g=0;do{c[a+(g<<2)>>2]=g>>>0<n>>>0?h:d;g=g+1|0}while((g|0)!=(t|0));i=v;return}case 1:{if(!t){i=v;return}else h=0;do{c[a+(h<<2)>>2]=((((Z((h>>>0)/(e>>>0)|0,o)|0)>>>1)+((h>>>0)%(e>>>0)|0)|0)>>>0)%(o>>>0)|0;h=h+1|0}while((h|0)!=(t|0));i=v;return}case 2:{n=c[b+24>>2]|0;m=c[b+28>>2]|0;h=o+-1|0;if(t){d=0;do{c[a+(d<<2)>>2]=h;d=d+1|0}while((d|0)!=(t|0))}if(!h){i=v;return}g=o+-2|0;while(1){j=c[n+(g<<2)>>2]|0;d=(j>>>0)/(e>>>0)|0;j=(j>>>0)%(e>>>0)|0;h=c[m+(g<<2)>>2]|0;l=(h>>>0)/(e>>>0)|0;h=(h>>>0)%(e>>>0)|0;b:do if(d>>>0<=l>>>0){if(j>>>0>h>>>0)while(1){d=d+1|0;if(d>>>0>l>>>0)break b}do{k=Z(d,e)|0;b=j;do{c[a+(b+k<<2)>>2]=g;b=b+1|0}while(b>>>0<=h>>>0);d=d+1|0}while(d>>>0<=l>>>0)}while(0);if(!g)break;else g=g+-1|0}i=v;return}case 5:{d=c[b+32>>2]|0;if(!e){i=v;return}k=1-d|0;if(!f){i=v;return}else{g=0;j=0}while(1){h=0;b=j;while(1){m=a+((Z(h,e)|0)+g<<2)|0;c[m>>2]=b>>>0<n>>>0?d:k;h=h+1|0;if((h|0)==(f|0))break;else b=b+1|0}g=g+1|0;if((g|0)==(e|0))break;else j=j+f|0}i=v;return}case 3:{m=c[b+32>>2]|0;if(t){d=0;do{c[a+(d<<2)>>2]=1;d=d+1|0}while((d|0)!=(t|0))}l=(e-m|0)>>>1;n=(f-m|0)>>>1;if(!u){i=v;return}t=m<<1;r=t+-1|0;s=e+-1|0;t=1-t|0;q=f+-1|0;o=n;p=0;g=l;f=l;k=n;b=l;j=m+-1|0;d=n;while(1){n=a+((Z(d,e)|0)+b<<2)|0;l=(c[n>>2]|0)==1;h=l&1;if(l)c[n>>2]=0;do if(!((j|0)==-1&(b|0)==(g|0))){if((j|0)==1&(b|0)==(f|0)){b=f+1|0;b=(b|0)<(s|0)?b:s;n=o;l=g;f=b;j=0;m=t;break}if((m|0)==-1&(d|0)==(k|0)){d=k+-1|0;d=(d|0)>0?d:0;n=o;l=g;k=d;j=t;m=0;break}if((m|0)==1&(d|0)==(o|0)){d=o+1|0;d=(d|0)<(q|0)?d:q;n=d;l=g;j=r;m=0;break}else{n=o;l=g;b=b+j|0;d=d+m|0;break}}else{b=g+-1|0;b=(b|0)>0?b:0;n=o;l=b;j=0;m=r}while(0);p=h+p|0;if(p>>>0>=u>>>0)break;else{o=n;g=l}}i=v;return}default:{if(!t){i=v;return}g=c[b+44>>2]|0;h=0;do{c[a+(h<<2)>>2]=c[g+(h<<2)>>2];h=h+1|0}while((h|0)!=(t|0));i=v;return}}}function Lb(){return 3472}function Mb(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0;k=i;i=i+80|0;h=k+32|0;j=k;Nb(d,h,j,e);if((cb(c[a>>2]|0)|0)==1){e=Ob(a,g,b+328|0,h,j,f)|0;if(e){i=k;return e|0}}else{e=Pb(a,g,b,h,j,f)|0;if(e){i=k;return e|0}}e=Qb(a,g+256|0,b+1352|0,h+21|0,j+16|0,c[b+140>>2]|0,f)|0;if(e){i=k;return e|0}if((c[a+196>>2]|0)>>>0>1){e=0;i=k;return e|0}sc(d,g);e=0;i=k;return e|0}function Nb(b,d,e,f){b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0;s=i;if(!f){i=s;return}p=c[b+4>>2]|0;q=Z(c[b+8>>2]|0,p)|0;n=(f>>>0)/(p>>>0)|0;g=Z(n,p)|0;o=f-g|0;k=p<<4;h=c[b>>2]|0;j=(o<<4)+(Z(p<<8,n)|0)|0;r=(n|0)!=0;if(r){m=j-(k|1)|0;a[d>>0]=a[h+m>>0]|0;a[d+1>>0]=a[h+(m+1)>>0]|0;a[d+2>>0]=a[h+(m+2)>>0]|0;a[d+3>>0]=a[h+(m+3)>>0]|0;a[d+4>>0]=a[h+(m+4)>>0]|0;a[d+5>>0]=a[h+(m+5)>>0]|0;a[d+6>>0]=a[h+(m+6)>>0]|0;a[d+7>>0]=a[h+(m+7)>>0]|0;a[d+8>>0]=a[h+(m+8)>>0]|0;a[d+9>>0]=a[h+(m+9)>>0]|0;a[d+10>>0]=a[h+(m+10)>>0]|0;a[d+11>>0]=a[h+(m+11)>>0]|0;a[d+12>>0]=a[h+(m+12)>>0]|0;a[d+13>>0]=a[h+(m+13)>>0]|0;a[d+14>>0]=a[h+(m+14)>>0]|0;a[d+15>>0]=a[h+(m+15)>>0]|0;a[d+16>>0]=a[h+(m+16)>>0]|0;a[d+17>>0]=a[h+(m+17)>>0]|0;a[d+18>>0]=a[h+(m+18)>>0]|0;a[d+19>>0]=a[h+(m+19)>>0]|0;a[d+20>>0]=a[h+(m+20)>>0]|0;m=d+21|0}else m=d;l=(g|0)!=(f|0);if(l){j=j+-1|0;a[e>>0]=a[h+j>>0]|0;j=j+k|0;a[e+1>>0]=a[h+j>>0]|0;j=j+k|0;a[e+2>>0]=a[h+j>>0]|0;j=j+k|0;a[e+3>>0]=a[h+j>>0]|0;j=j+k|0;a[e+4>>0]=a[h+j>>0]|0;j=j+k|0;a[e+5>>0]=a[h+j>>0]|0;j=j+k|0;a[e+6>>0]=a[h+j>>0]|0;j=j+k|0;a[e+7>>0]=a[h+j>>0]|0;j=j+k|0;a[e+8>>0]=a[h+j>>0]|0;j=j+k|0;a[e+9>>0]=a[h+j>>0]|0;j=j+k|0;a[e+10>>0]=a[h+j>>0]|0;j=j+k|0;a[e+11>>0]=a[h+j>>0]|0;j=j+k|0;a[e+12>>0]=a[h+j>>0]|0;j=j+k|0;a[e+13>>0]=a[h+j>>0]|0;j=j+k|0;a[e+14>>0]=a[h+j>>0]|0;a[e+15>>0]=a[h+(j+k)>>0]|0;e=e+16|0}d=p<<3&2147483640;f=c[b>>2]|0;g=(Z(n<<3,d)|0)+(q<<8)+(o<<3)|0;if(r){b=g-(d|1)|0;a[m>>0]=a[f+b>>0]|0;a[m+1>>0]=a[f+(b+1)>>0]|0;a[m+2>>0]=a[f+(b+2)>>0]|0;a[m+3>>0]=a[f+(b+3)>>0]|0;a[m+4>>0]=a[f+(b+4)>>0]|0;a[m+5>>0]=a[f+(b+5)>>0]|0;a[m+6>>0]=a[f+(b+6)>>0]|0;a[m+7>>0]=a[f+(b+7)>>0]|0;a[m+8>>0]=a[f+(b+8)>>0]|0;b=b+(q<<6)|0;a[m+9>>0]=a[f+b>>0]|0;a[m+10>>0]=a[f+(b+1)>>0]|0;a[m+11>>0]=a[f+(b+2)>>0]|0;a[m+12>>0]=a[f+(b+3)>>0]|0;a[m+13>>0]=a[f+(b+4)>>0]|0;a[m+14>>0]=a[f+(b+5)>>0]|0;a[m+15>>0]=a[f+(b+6)>>0]|0;a[m+16>>0]=a[f+(b+7)>>0]|0;a[m+17>>0]=a[f+(b+8)>>0]|0}if(!l){i=s;return}m=g+-1|0;a[e>>0]=a[f+m>>0]|0;m=m+d|0;a[e+1>>0]=a[f+m>>0]|0;m=m+d|0;a[e+2>>0]=a[f+m>>0]|0;m=m+d|0;a[e+3>>0]=a[f+m>>0]|0;m=m+d|0;a[e+4>>0]=a[f+m>>0]|0;m=m+d|0;a[e+5>>0]=a[f+m>>0]|0;m=m+d|0;a[e+6>>0]=a[f+m>>0]|0;m=m+d|0;a[e+7>>0]=a[f+m>>0]|0;m=m+(d+((q<<6)-(p<<6)))|0;a[e+8>>0]=a[f+m>>0]|0;m=m+d|0;a[e+9>>0]=a[f+m>>0]|0;m=m+d|0;a[e+10>>0]=a[f+m>>0]|0;m=m+d|0;a[e+11>>0]=a[f+m>>0]|0;m=m+d|0;a[e+12>>0]=a[f+m>>0]|0;m=m+d|0;a[e+13>>0]=a[f+m>>0]|0;m=m+d|0;a[e+14>>0]=a[f+m>>0]|0;a[e+15>>0]=a[f+(m+d)>>0]|0;i=s;return}function Ob(b,e,f,g,h,j){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0;z=i;k=b+200|0;l=zb(b,c[k>>2]|0)|0;o=(j|0)!=0;if((l|0)!=0&o){n=(cb(c[c[k>>2]>>2]|0)|0)==2;n=n?0:l}else n=l;j=b+204|0;l=zb(b,c[j>>2]|0)|0;if((l|0)!=0&o){p=(cb(c[c[j>>2]>>2]|0)|0)==2;p=p?0:l}else p=l;j=b+212|0;l=zb(b,c[j>>2]|0)|0;if((l|0)!=0&o){r=(cb(c[c[j>>2]>>2]|0)|0)==2;l=r?0:l}j=fb(c[b>>2]|0)|0;if(!j){if(!p){r=1;i=z;return r|0}b=g+1|0;m=g+2|0;s=g+3|0;t=g+4|0;u=g+5|0;v=g+6|0;w=g+7|0;x=g+8|0;y=g+9|0;h=g+10|0;l=g+11|0;j=g+12|0;k=g+13|0;q=g+14|0;r=g+15|0;p=g+16|0;o=e;n=0;while(1){a[o>>0]=a[b>>0]|0;a[o+1>>0]=a[m>>0]|0;a[o+2>>0]=a[s>>0]|0;a[o+3>>0]=a[t>>0]|0;a[o+4>>0]=a[u>>0]|0;a[o+5>>0]=a[v>>0]|0;a[o+6>>0]=a[w>>0]|0;a[o+7>>0]=a[x>>0]|0;a[o+8>>0]=a[y>>0]|0;a[o+9>>0]=a[h>>0]|0;a[o+10>>0]=a[l>>0]|0;a[o+11>>0]=a[j>>0]|0;a[o+12>>0]=a[k>>0]|0;a[o+13>>0]=a[q>>0]|0;a[o+14>>0]=a[r>>0]|0;a[o+15>>0]=a[p>>0]|0;n=n+1|0;if((n|0)==16)break;else o=o+16|0}}else if((j|0)==2){l=g+1|0;k=(n|0)!=0;j=(p|0)!=0;do if(!(k&j)){if(k){k=((d[h>>0]|0)+8+(d[h+1>>0]|0)+(d[h+2>>0]|0)+(d[h+3>>0]|0)+(d[h+4>>0]|0)+(d[h+5>>0]|0)+(d[h+6>>0]|0)+(d[h+7>>0]|0)+(d[h+8>>0]|0)+(d[h+9>>0]|0)+(d[h+10>>0]|0)+(d[h+11>>0]|0)+(d[h+12>>0]|0)+(d[h+13>>0]|0)+(d[h+14>>0]|0)+(d[h+15>>0]|0)|0)>>>4;break}if(j)k=((d[l>>0]|0)+8+(d[g+2>>0]|0)+(d[g+3>>0]|0)+(d[g+4>>0]|0)+(d[g+5>>0]|0)+(d[g+6>>0]|0)+(d[g+7>>0]|0)+(d[g+8>>0]|0)+(d[g+9>>0]|0)+(d[g+10>>0]|0)+(d[g+11>>0]|0)+(d[g+12>>0]|0)+(d[g+13>>0]|0)+(d[g+14>>0]|0)+(d[g+15>>0]|0)+(d[g+16>>0]|0)|0)>>>4;else k=128}else{j=0;k=0;do{r=j;j=j+1|0;k=(d[g+j>>0]|0)+k+(d[h+r>>0]|0)|0}while((j|0)!=16);k=(k+16|0)>>>5}while(0);nd(e|0,k&255|0,256)|0}else if((j|0)==1)if(!n){r=1;i=z;return r|0}else{k=e;j=0;while(1){r=h+j|0;a[k>>0]=a[r>>0]|0;a[k+1>>0]=a[r>>0]|0;a[k+2>>0]=a[r>>0]|0;a[k+3>>0]=a[r>>0]|0;a[k+4>>0]=a[r>>0]|0;a[k+5>>0]=a[r>>0]|0;a[k+6>>0]=a[r>>0]|0;a[k+7>>0]=a[r>>0]|0;a[k+8>>0]=a[r>>0]|0;a[k+9>>0]=a[r>>0]|0;a[k+10>>0]=a[r>>0]|0;a[k+11>>0]=a[r>>0]|0;a[k+12>>0]=a[r>>0]|0;a[k+13>>0]=a[r>>0]|0;a[k+14>>0]=a[r>>0]|0;a[k+15>>0]=a[r>>0]|0;j=j+1|0;if((j|0)==16)break;else k=k+16|0}}else{if(!((n|0)!=0&(p|0)!=0&(l|0)!=0)){r=1;i=z;return r|0}j=d[g+16>>0]|0;m=d[h+15>>0]|0;o=d[g>>0]|0;p=(((d[g+9>>0]|0)-(d[g+7>>0]|0)+((d[g+10>>0]|0)-(d[g+6>>0]|0)<<1)+(((d[g+11>>0]|0)-(d[g+5>>0]|0)|0)*3|0)+((d[g+12>>0]|0)-(d[g+4>>0]|0)<<2)+(((d[g+13>>0]|0)-(d[g+3>>0]|0)|0)*5|0)+(((d[g+14>>0]|0)-(d[g+2>>0]|0)|0)*6|0)+(((d[g+15>>0]|0)-(d[g+1>>0]|0)|0)*7|0)+(j-o<<3)|0)*5|0)+32>>6;o=(((d[h+8>>0]|0)-(d[h+6>>0]|0)+(m-o<<3)+((d[h+9>>0]|0)-(d[h+5>>0]|0)<<1)+(((d[h+10>>0]|0)-(d[h+4>>0]|0)|0)*3|0)+((d[h+11>>0]|0)-(d[h+3>>0]|0)<<2)+(((d[h+12>>0]|0)-(d[h+2>>0]|0)|0)*5|0)+(((d[h+13>>0]|0)-(d[h+1>>0]|0)|0)*6|0)+(((d[h+14>>0]|0)-(d[h>>0]|0)|0)*7|0)|0)*5|0)+32>>6;j=(m+j<<4)+16|0;m=0;do{k=j+(Z(m+-7|0,o)|0)|0;n=m<<4;b=0;do{l=k+(Z(b+-7|0,p)|0)>>5;if((l|0)<0)l=0;else l=(l|0)>255?-1:l&255;a[e+(b+n)>>0]=l;b=b+1|0}while((b|0)!=16);m=m+1|0}while((m|0)!=16)}Rb(e,f,0);Rb(e,f+64|0,1);Rb(e,f+128|0,2);Rb(e,f+192|0,3);Rb(e,f+256|0,4);Rb(e,f+320|0,5);Rb(e,f+384|0,6);Rb(e,f+448|0,7);Rb(e,f+512|0,8);Rb(e,f+576|0,9);Rb(e,f+640|0,10);Rb(e,f+704|0,11);Rb(e,f+768|0,12);Rb(e,f+832|0,13);Rb(e,f+896|0,14);Rb(e,f+960|0,15);r=0;i=z;return r|0}function Pb(b,e,f,g,h,j){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0;N=i;M=(j|0)!=0;L=0;a:while(1){l=vb(L)|0;n=c[l+4>>2]|0;l=ub(b,c[l>>2]|0)|0;j=zb(b,l)|0;if((j|0)!=0&M){E=(cb(c[l>>2]|0)|0)==2;j=E?0:j}o=wb(L)|0;m=c[o+4>>2]|0;o=ub(b,c[o>>2]|0)|0;k=zb(b,o)|0;if((k|0)!=0&M){E=(cb(c[o>>2]|0)|0)==2;k=E?0:k}G=(j|0)!=0;H=(k|0)!=0;I=G&H;if(I){if(!(cb(c[l>>2]|0)|0))n=d[l+(n&255)+82>>0]|0;else n=2;if(!(cb(c[o>>2]|0)|0))j=d[o+(m&255)+82>>0]|0;else j=2;j=n>>>0<j>>>0?n:j}else j=2;if(!(c[f+(L<<2)+12>>2]|0)){E=c[f+(L<<2)+76>>2]|0;j=(E>>>0>=j>>>0&1)+E|0}a[b+L+82>>0]=j;l=c[(xb(L)|0)>>2]|0;l=ub(b,l)|0;m=zb(b,l)|0;if((m|0)!=0&M){E=(cb(c[l>>2]|0)|0)==2;m=E?0:m}l=c[(yb(L)|0)>>2]|0;l=ub(b,l)|0;n=zb(b,l)|0;if((n|0)!=0&M){E=(cb(c[l>>2]|0)|0)==2;n=E?0:n}J=c[3344+(L<<2)>>2]|0;K=c[3408+(L<<2)>>2]|0;r=(1285>>>L&1|0)!=0;if(r){o=h+K|0;l=h+(K+1)|0;p=h+(K+2)|0;q=h+(K+3)|0}else{q=(K<<4)+J|0;o=e+(q+-1)|0;l=e+(q+15)|0;p=e+(q+31)|0;q=e+(q+47)|0}A=a[o>>0]|0;y=a[l>>0]|0;F=a[p>>0]|0;E=a[q>>0]|0;do if(!(51>>>L&1)){x=K+-1|0;w=(x<<4)+J|0;o=a[e+w>>0]|0;q=a[e+(w+1)>>0]|0;s=a[e+(w+2)>>0]|0;u=a[e+(w+3)>>0]|0;t=a[e+(w+4)>>0]|0;l=a[e+(w+5)>>0]|0;v=a[e+(w+6)>>0]|0;p=a[e+(w+7)>>0]|0;if(r){D=v;C=u;u=p;B=q;z=s;v=h+x|0;break}else{D=v;C=u;u=p;B=q;z=s;v=e+(w+-1)|0;break}}else{D=a[g+(J+7)>>0]|0;C=a[g+(J+4)>>0]|0;t=a[g+(J+5)>>0]|0;l=a[g+(J+6)>>0]|0;o=a[g+(J+1)>>0]|0;u=a[g+(J+8)>>0]|0;B=a[g+(J+2)>>0]|0;z=a[g+(J+3)>>0]|0;v=g+J|0}while(0);v=a[v>>0]|0;switch(j|0){case 4:{if(!(I&(n|0)!=0)){k=1;j=51;break a}j=o&255;o=v&255;q=A&255;s=j+2|0;D=(s+q+(o<<1)|0)>>>2;u=D&255;k=B&255;o=o+2|0;v=((j<<1)+k+o|0)>>>2&255;j=z&255;s=((k<<1)+j+s|0)>>>2&255;z=y&255;o=(z+(q<<1)+o|0)>>>2;t=o&255;A=F&255;B=(q+2+(z<<1)+A|0)>>>2;q=u;p=t;n=B&255;m=v;l=s;j=((C&255)+2+k+(j<<1)|0)>>>2&255;k=u;r=v;o=(z+2+(A<<1)+(E&255)|0)>>>2&255|B<<8&65280|D<<24|o<<16&16711680;break}case 6:{if(!(I&(n|0)!=0)){k=1;j=51;break a}l=v&255;s=A&255;u=s+1|0;r=(u+l|0)>>>1&255;C=y&255;v=((s<<1)+2+C+l|0)>>>2&255;u=(u+C|0)>>>1&255;D=F&255;s=s+2|0;y=(s+(C<<1)+D|0)>>>2;A=(C+1+D|0)>>>1;E=E&255;j=o&255;s=(s+j+(l<<1)|0)>>>2&255;k=B&255;q=r;p=u;n=A&255;m=s;l=(k+2+(j<<1)+l|0)>>>2&255;j=((z&255)+2+(k<<1)+j|0)>>>2&255;k=v;t=y&255;o=y<<24|A<<16&16711680|(D+1+E|0)>>>1&255|C+2+(D<<1)+E<<6&65280;break}case 2:{do if(!I){if(G){j=((A&255)+2+(y&255)+(F&255)+(E&255)|0)>>>2;break}if(H)j=((C&255)+2+(z&255)+(B&255)+(o&255)|0)>>>2;else j=128}else j=((A&255)+4+(y&255)+(F&255)+(E&255)+(C&255)+(z&255)+(B&255)+(o&255)|0)>>>3;while(0);o=Z(j&255,16843009)|0;n=o&255;t=o>>>8&255;u=o>>>16&255;v=o>>>24&255;q=n;p=n;m=t;l=u;j=v;k=t;r=u;s=v;break}case 0:{if(!k){k=1;j=51;break a}q=o;p=o;n=o;m=B;l=z;j=C;k=B;r=z;s=C;t=B;u=z;v=C;o=(z&255)<<16|(C&255)<<24|(B&255)<<8|o&255;break}case 1:{if(!G){k=1;j=51;break a}j=Z(A&255,16843009)|0;s=Z(y&255,16843009)|0;v=Z(F&255,16843009)|0;q=j&255;p=s&255;n=v&255;m=j>>>8&255;l=j>>>16&255;j=j>>>24&255;k=s>>>8&255;r=s>>>16&255;s=s>>>24&255;t=v>>>8&255;u=v>>>16&255;v=v>>>24&255;o=Z(E&255,16843009)|0;break}case 7:{if(!k){k=1;j=51;break a}A=(m|0)==0;n=o&255;p=B&255;z=z&255;m=(z+1+p|0)>>>1&255;o=C&255;u=o+1|0;v=(u+z|0)>>>1&255;B=(A?C:t)&255;u=(u+B|0)>>>1&255;j=z+2|0;y=o+2|0;z=(y+p+(z<<1)|0)>>>2;o=(j+(o<<1)+B|0)>>>2;E=(A?C:l)&255;y=(y+E+(B<<1)|0)>>>2;q=(p+1+n|0)>>>1&255;p=(j+n+(p<<1)|0)>>>2&255;n=m;l=v;j=u;k=z&255;r=o&255;s=y&255;t=v;v=(B+1+E|0)>>>1&255;o=y<<16&16711680|z&255|(B+2+((A?C:D)&255)+(E<<1)|0)>>>2<<24|o<<8&65280;break}case 3:{if(!k){k=1;j=51;break a}n=(m|0)==0;q=B&255;m=z&255;p=m+2|0;k=C&255;B=k+2|0;m=(B+q+(m<<1)|0)>>>2&255;v=(n?C:t)&255;k=(p+(k<<1)+v|0)>>>2&255;E=(n?C:l)&255;B=(B+E+(v<<1)|0)>>>2;t=B&255;A=(n?C:D)&255;D=(v+2+A+(E<<1)|0)>>>2;v=D&255;C=(n?C:u)&255;E=(E+2+C+(A<<1)|0)>>>2;q=(p+(o&255)+(q<<1)|0)>>>2&255;p=m;n=k;l=k;j=t;r=t;s=v;u=v;v=E&255;o=(A+2+(C*3|0)|0)>>>2<<24|B&255|D<<8&65280|E<<16&16711680;break}case 5:{if(!(I&(n|0)!=0)){k=1;j=51;break a}n=v&255;u=o&255;t=(u+1+n|0)>>>1&255;x=B&255;E=(x+2+(u<<1)+n|0)>>>2;B=A&255;A=u+2|0;o=(A+B+(n<<1)|0)>>>2;u=(x+1+u|0)>>>1&255;s=z&255;A=((x<<1)+s+A|0)>>>2;v=(s+1+x|0)>>>1&255;C=C&255;D=y&255;q=t;p=o&255;n=(D+2+(B<<1)+n|0)>>>2&255;m=u;l=v;j=(C+1+s|0)>>>1&255;k=E&255;r=A&255;s=(C+2+x+(s<<1)|0)>>>2&255;o=A<<24|(B+2+(F&255)+(D<<1)|0)>>>2&255|E<<16&16711680|o<<8&65280;break}default:{if(!G){k=1;j=51;break a}s=A&255;j=y&255;m=F&255;l=(j+1+m|0)>>>1&255;o=E&255;k=(j+2+(m<<1)+o|0)>>>2&255;r=(m+1+o|0)>>>1&255;t=(m+2+(o*3|0)|0)>>>2&255;q=(s+1+j|0)>>>1&255;p=l;n=r;m=(s+2+(j<<1)+m|0)>>>2&255;j=k;s=t;u=E;v=E;o=o<<8|o|o<<16|o<<24}}E=(K<<4)+J|0;c[e+E>>2]=(l&255)<<16|(j&255)<<24|(m&255)<<8|q&255;c[e+(E+16)>>2]=(r&255)<<16|(s&255)<<24|(k&255)<<8|p&255;c[e+(E+32)>>2]=(u&255)<<16|(v&255)<<24|(t&255)<<8|n&255;c[e+(E+48)>>2]=o;Rb(e,f+(L<<6)+328|0,L);L=L+1|0;if(L>>>0>=16){k=0;j=51;break}}if((j|0)==51){i=N;return k|0}return 0}function Qb(b,e,f,g,h,j,k){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;k=k|0;var l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0;y=i;m=b+200|0;l=zb(b,c[m>>2]|0)|0;n=(k|0)!=0;if((l|0)!=0&n){o=(cb(c[c[m>>2]>>2]|0)|0)==2;l=o?0:l}m=b+204|0;k=zb(b,c[m>>2]|0)|0;if((k|0)!=0&n){o=(cb(c[c[m>>2]>>2]|0)|0)==2;o=o?0:k}else o=k;m=b+212|0;k=zb(b,c[m>>2]|0)|0;if((k|0)!=0&n){n=(cb(c[c[m>>2]>>2]|0)|0)==2;k=n?0:k}w=(l|0)!=0;x=(o|0)!=0;v=w&x;u=v&(k|0)!=0;t=(l|0)==0;s=(o|0)==0;p=g;q=16;r=0;while(1){if((j|0)==1){if(t){l=1;k=29;break}else{n=e;b=8;m=h}while(1){b=b+-1|0;a[n>>0]=a[m>>0]|0;a[n+1>>0]=a[m>>0]|0;a[n+2>>0]=a[m>>0]|0;a[n+3>>0]=a[m>>0]|0;a[n+4>>0]=a[m>>0]|0;a[n+5>>0]=a[m>>0]|0;a[n+6>>0]=a[m>>0]|0;a[n+7>>0]=a[m>>0]|0;if(!b)break;else{n=n+8|0;m=m+1|0}}}else if((j|0)==2){if(s){l=1;k=29;break}else{n=p;b=e;m=8}while(1){n=n+1|0;m=m+-1|0;a[b>>0]=a[n>>0]|0;a[b+8>>0]=a[n>>0]|0;a[b+16>>0]=a[n>>0]|0;a[b+24>>0]=a[n>>0]|0;a[b+32>>0]=a[n>>0]|0;a[b+40>>0]=a[n>>0]|0;a[b+48>>0]=a[n>>0]|0;a[b+56>>0]=a[n>>0]|0;if(!m)break;else b=b+1|0}}else if(!j){m=p+1|0;do if(!v){if(x){n=((d[m>>0]|0)+2+(d[p+2>>0]|0)+(d[p+3>>0]|0)+(d[p+4>>0]|0)|0)>>>2;b=((d[p+5>>0]|0)+2+(d[p+6>>0]|0)+(d[p+7>>0]|0)+(d[p+8>>0]|0)|0)>>>2;break}if(w){b=((d[h>>0]|0)+2+(d[h+1>>0]|0)+(d[h+2>>0]|0)+(d[h+3>>0]|0)|0)>>>2;n=b}else{n=128;b=128}}else{n=((d[m>>0]|0)+4+(d[p+2>>0]|0)+(d[p+3>>0]|0)+(d[p+4>>0]|0)+(d[h>>0]|0)+(d[h+1>>0]|0)+(d[h+2>>0]|0)+(d[h+3>>0]|0)|0)>>>3;b=((d[p+5>>0]|0)+2+(d[p+6>>0]|0)+(d[p+7>>0]|0)+(d[p+8>>0]|0)|0)>>>2}while(0);n=n&255;o=b&255;nd(e|0,n|0,4)|0;nd(e+4|0,o|0,4)|0;nd(e+8|0,n|0,4)|0;nd(e+12|0,o|0,4)|0;nd(e+16|0,n|0,4)|0;nd(e+20|0,o|0,4)|0;g=e+32|0;nd(e+24|0,n|0,4)|0;nd(e+28|0,o|0,4)|0;if(w){o=d[h+4>>0]|0;n=d[h+5>>0]|0;b=d[h+6>>0]|0;m=d[h+7>>0]|0;k=(o+2+n+b+m|0)>>>2;if(x){l=k;n=(o+4+n+b+m+(d[p+5>>0]|0)+(d[p+6>>0]|0)+(d[p+7>>0]|0)+(d[p+8>>0]|0)|0)>>>3}else{l=k;n=k}}else if(x){l=((d[m>>0]|0)+2+(d[p+2>>0]|0)+(d[p+3>>0]|0)+(d[p+4>>0]|0)|0)>>>2;n=((d[p+5>>0]|0)+2+(d[p+6>>0]|0)+(d[p+7>>0]|0)+(d[p+8>>0]|0)|0)>>>2}else{l=128;n=128}b=l&255;o=n&255;nd(g|0,b|0,4)|0;nd(e+36|0,o|0,4)|0;nd(e+40|0,b|0,4)|0;nd(e+44|0,o|0,4)|0;nd(e+48|0,b|0,4)|0;nd(e+52|0,o|0,4)|0;nd(e+56|0,b|0,4)|0;nd(e+60|0,o|0,4)|0}else{if(!u){l=1;k=29;break}n=d[p+8>>0]|0;b=d[h+7>>0]|0;l=d[p>>0]|0;k=(((d[p+5>>0]|0)-(d[p+3>>0]|0)+((d[p+6>>0]|0)-(d[p+2>>0]|0)<<1)+(((d[p+7>>0]|0)-(d[p+1>>0]|0)|0)*3|0)+(n-l<<2)|0)*17|0)+16>>5;l=(((d[h+4>>0]|0)-(d[h+2>>0]|0)+(b-l<<2)+((d[h+5>>0]|0)-(d[h+1>>0]|0)<<1)+(((d[h+6>>0]|0)-(d[h>>0]|0)|0)*3|0)|0)*17|0)+16>>5;o=Z(k,-3)|0;n=(b+n<<4)+16+(Z(l,-3)|0)|0;b=e;m=8;while(1){m=m+-1|0;g=n+o|0;a[b>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+1>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+2>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+3>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+4>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+5>>0]=a[(g>>5)+3984>>0]|0;g=g+k|0;a[b+6>>0]=a[(g>>5)+3984>>0]|0;a[b+7>>0]=a[(g+k>>5)+3984>>0]|0;if(!m)break;else{n=n+l|0;b=b+8|0}}}Rb(e,f,q);g=q|1;Rb(e,f+64|0,g);Rb(e,f+128|0,g+1|0);Rb(e,f+192|0,q|3);r=r+1|0;if(r>>>0>=2){l=0;k=29;break}else{p=p+9|0;q=q+4|0;e=e+64|0;h=h+8|0;f=f+256|0}}if((k|0)==29){i=y;return l|0}return 0}function Rb(b,e,f){b=b|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0;h=i;g=c[e>>2]|0;if((g|0)==16777215){i=h;return}m=f>>>0<16;l=m?16:8;m=m?f:f&3;m=(Z(c[3408+(m<<2)>>2]|0,l)|0)+(c[3344+(m<<2)>>2]|0)|0;n=b+m|0;p=c[e+4>>2]|0;j=b+(m+1)|0;f=d[j>>0]|0;a[n>>0]=a[3472+(g+512+(d[n>>0]|0))>>0]|0;n=c[e+8>>2]|0;k=b+(m+2)|0;o=d[k>>0]|0;a[j>>0]=a[3472+(p+512+f)>>0]|0;g=b+(m+3)|0;j=a[3472+((c[e+12>>2]|0)+512+(d[g>>0]|0))>>0]|0;a[k>>0]=a[3472+(n+512+o)>>0]|0;a[g>>0]=j;g=m+l|0;m=b+g|0;j=c[e+20>>2]|0;k=b+(g+1)|0;o=d[k>>0]|0;a[m>>0]=a[3472+((c[e+16>>2]|0)+512+(d[m>>0]|0))>>0]|0;m=c[e+24>>2]|0;n=b+(g+2)|0;f=d[n>>0]|0;a[k>>0]=a[3472+(j+512+o)>>0]|0;k=b+(g+3)|0;o=a[3472+((c[e+28>>2]|0)+512+(d[k>>0]|0))>>0]|0;a[n>>0]=a[3472+(m+512+f)>>0]|0;a[k>>0]=o;g=g+l|0;k=b+g|0;o=c[e+36>>2]|0;n=b+(g+1)|0;f=d[n>>0]|0;a[k>>0]=a[3472+((c[e+32>>2]|0)+512+(d[k>>0]|0))>>0]|0;k=c[e+40>>2]|0;m=b+(g+2)|0;j=d[m>>0]|0;a[n>>0]=a[3472+(o+512+f)>>0]|0;n=b+(g+3)|0;f=a[3472+((c[e+44>>2]|0)+512+(d[n>>0]|0))>>0]|0;a[m>>0]=a[3472+(k+512+j)>>0]|0;a[n>>0]=f;g=g+l|0;l=b+g|0;n=c[e+52>>2]|0;f=b+(g+1)|0;m=d[f>>0]|0;a[l>>0]=a[3472+((c[e+48>>2]|0)+512+(d[l>>0]|0))>>0]|0;l=c[e+56>>2]|0;j=b+(g+2)|0;k=d[j>>0]|0;a[f>>0]=a[3472+(n+512+m)>>0]|0;g=b+(g+3)|0;f=a[3472+((c[e+60>>2]|0)+512+(d[g>>0]|0))>>0]|0;a[j>>0]=a[3472+(l+512+k)>>0]|0;a[g>>0]=f;i=h;return}
function yc(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0;q=i;l=b+-1|0;k=a[b+1>>0]|0;m=d[l>>0]|0;n=d[b>>0]|0;r=m-n|0;p=f+4|0;do if((((r|0)>-1?r:0-r|0)>>>0<(c[p>>2]|0)>>>0?(o=d[b+-2>>0]|0,r=o-m|0,j=c[f+8>>2]|0,((r|0)>-1?r:0-r|0)>>>0<j>>>0):0)?(h=k&255,k=h-n|0,((k|0)>-1?k:0-k|0)>>>0<j>>>0):0)if(e>>>0<4){k=d[(c[f>>2]|0)+(e+-1)>>0]|0;k=Oa(~k,k+1|0,4-h+(n-m<<2)+o>>3)|0;o=a[3472+((n|512)-k)>>0]|0;a[l>>0]=a[3472+((m|512)+k)>>0]|0;a[b>>0]=o;break}else{a[l>>0]=(m+2+h+(o<<1)|0)>>>2;a[b>>0]=(n+2+(h<<1)+o|0)>>>2;break}while(0);l=b+g|0;m=b+(g+-1)|0;o=d[m>>0]|0;n=d[l>>0]|0;k=o-n|0;if(((k|0)>-1?k:0-k|0)>>>0>=(c[p>>2]|0)>>>0){i=q;return}k=d[b+(g+-2)>>0]|0;p=k-o|0;j=c[f+8>>2]|0;if(((p|0)>-1?p:0-p|0)>>>0>=j>>>0){i=q;return}h=d[b+(g+1)>>0]|0;g=h-n|0;if(((g|0)>-1?g:0-g|0)>>>0>=j>>>0){i=q;return}if(e>>>0<4){b=d[(c[f>>2]|0)+(e+-1)>>0]|0;b=Oa(~b,b+1|0,4-h+(n-o<<2)+k>>3)|0;g=a[3472+((n|512)-b)>>0]|0;a[m>>0]=a[3472+((o|512)+b)>>0]|0;a[l>>0]=g;i=q;return}else{a[m>>0]=(o+2+h+(k<<1)|0)>>>2;a[l>>0]=(n+2+(h<<1)+k|0)>>>2;i=q;return}}function zc(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;v=i;if(e>>>0<4){n=d[(c[f>>2]|0)+(e+-1)>>0]|0;h=n+1|0;q=0-g|0;e=f+4|0;p=q<<1;o=f+8|0;n=~n;j=8;while(1){m=b+q|0;f=a[b+g>>0]|0;l=d[m>>0]|0;k=d[b>>0]|0;r=l-k|0;if((((r|0)>-1?r:0-r|0)>>>0<(c[e>>2]|0)>>>0?(t=d[b+p>>0]|0,r=t-l|0,s=c[o>>2]|0,((r|0)>-1?r:0-r|0)>>>0<s>>>0):0)?(u=f&255,f=u-k|0,((f|0)>-1?f:0-f|0)>>>0<s>>>0):0){r=Oa(n,h,4-u+(k-l<<2)+t>>3)|0;f=a[3472+((k|512)-r)>>0]|0;a[m>>0]=a[3472+((l|512)+r)>>0]|0;a[b>>0]=f}j=j+-1|0;if(!j)break;else b=b+1|0}i=v;return}else{o=0-g|0;m=f+4|0;n=o<<1;f=f+8|0;l=8;while(1){h=b+o|0;e=a[b+g>>0]|0;j=d[h>>0]|0;k=d[b>>0]|0;s=j-k|0;if((((s|0)>-1?s:0-s|0)>>>0<(c[m>>2]|0)>>>0?(p=d[b+n>>0]|0,s=p-j|0,q=c[f>>2]|0,((s|0)>-1?s:0-s|0)>>>0<q>>>0):0)?(r=e&255,e=r-k|0,((e|0)>-1?e:0-e|0)>>>0<q>>>0):0){a[h>>0]=(j+2+r+(p<<1)|0)>>>2;a[b>>0]=(k+2+(r<<1)+p|0)>>>2}l=l+-1|0;if(!l)break;else b=b+1|0}i=v;return}}function Ac(b,e,f,g){b=b|0;e=e|0;f=f|0;g=g|0;var h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0;t=i;r=d[(c[f>>2]|0)+(e+-1)>>0]|0;s=r+1|0;l=0-g|0;h=f+4|0;q=l<<1;e=f+8|0;r=~r;l=b+l|0;m=a[b+g>>0]|0;k=d[l>>0]|0;j=d[b>>0]|0;u=k-j|0;f=c[h>>2]|0;if((((u|0)>-1?u:0-u|0)>>>0<f>>>0?(o=d[b+q>>0]|0,u=o-k|0,n=c[e>>2]|0,((u|0)>-1?u:0-u|0)>>>0<n>>>0):0)?(p=m&255,m=p-j|0,((m|0)>-1?m:0-m|0)>>>0<n>>>0):0){p=Oa(r,s,4-p+(j-k<<2)+o>>3)|0;f=a[3472+((j|512)-p)>>0]|0;a[l>>0]=a[3472+((k|512)+p)>>0]|0;a[b>>0]=f;f=c[h>>2]|0}m=b+1|0;j=b+(1-g)|0;k=d[j>>0]|0;l=d[m>>0]|0;p=k-l|0;if(((p|0)>-1?p:0-p|0)>>>0>=f>>>0){i=t;return}h=d[b+(q|1)>>0]|0;p=h-k|0;f=c[e>>2]|0;if(((p|0)>-1?p:0-p|0)>>>0>=f>>>0){i=t;return}e=d[b+(g+1)>>0]|0;p=e-l|0;if(((p|0)>-1?p:0-p|0)>>>0>=f>>>0){i=t;return}o=Oa(r,s,4-e+(l-k<<2)+h>>3)|0;p=a[3472+((l|512)-o)>>0]|0;a[j>>0]=a[3472+((k|512)+o)>>0]|0;a[m>>0]=p;i=t;return}function Bc(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0;r=i;p=c[b+4>>2]|0;q=c[b+8>>2]|0;if(!((d|0)==0|(d|0)==5)?(c[a+3384>>2]|0)==0:0)f=0;else{g=a+1220|0;e=0;do{f=ic(g,e)|0;e=e+1|0}while(e>>>0<16&(f|0)==0)}l=a+1176|0;n=c[l>>2]|0;if(n){m=c[a+1212>>2]|0;e=0;j=0;g=0;do{if(c[m+(j*216|0)+196>>2]|0)break;j=j+1|0;e=e+1|0;o=(e|0)==(p|0);g=(o&1)+g|0;e=o?0:e}while(j>>>0<n>>>0);if((j|0)!=(n|0)){o=a+1212|0;n=c[o>>2]|0;j=Z(g,p)|0;if(e){l=a+1204|0;h=e;do{h=h+-1|0;m=h+j|0;Cc(n+(m*216|0)|0,b,g,h,d,f);c[n+(m*216|0)+196>>2]=1;c[l>>2]=(c[l>>2]|0)+1}while((h|0)!=0)}e=e+1|0;if(e>>>0<p>>>0){m=a+1204|0;do{l=e+j|0;k=n+(l*216|0)+196|0;if(!(c[k>>2]|0)){Cc(n+(l*216|0)|0,b,g,e,d,f);c[k>>2]=1;c[m>>2]=(c[m>>2]|0)+1}e=e+1|0}while((e|0)!=(p|0))}if(g){if(p){n=g+-1|0;h=Z(n,p)|0;e=a+1204|0;l=0-p|0;k=0;do{m=n;j=(c[o>>2]|0)+((k+h|0)*216|0)|0;while(1){Cc(j,b,m,k,d,f);c[j+196>>2]=1;c[e>>2]=(c[e>>2]|0)+1;if(!m)break;else{m=m+-1|0;j=j+(l*216|0)|0}}k=k+1|0}while((k|0)!=(p|0))}}else g=0;g=g+1|0;if(g>>>0>=q>>>0){i=r;return 0}m=a+1204|0;if(!p){i=r;return 0}do{e=c[o>>2]|0;l=Z(g,p)|0;k=0;do{h=k+l|0;j=e+(h*216|0)+196|0;if(!(c[j>>2]|0)){Cc(e+(h*216|0)|0,b,g,k,d,f);c[j>>2]=1;c[m>>2]=(c[m>>2]|0)+1}k=k+1|0}while((k|0)!=(p|0));g=g+1|0}while((g|0)!=(q|0));i=r;return 0}}if((d|0)==2|(d|0)==7)if((c[a+3384>>2]|0)==0|(f|0)==0)g=13;else g=14;else if(!f)g=13;else g=14;if((g|0)==13)id(c[b>>2]|0,128,Z(p*384|0,q)|0);else if((g|0)==14)hd(c[b>>2]|0,f,Z(p*384|0,q)|0);g=c[l>>2]|0;c[a+1204>>2]=g;if(!g){i=r;return 0}e=c[a+1212>>2]|0;f=0;do{c[e+(f*216|0)+8>>2]=1;f=f+1|0}while(f>>>0<g>>>0);i=r;return 0}function Cc(b,e,f,g,h,j){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0,O=0,P=0,Q=0,R=0,S=0,T=0,U=0,V=0,W=0,X=0,Y=0,_=0,$=0,aa=0,ba=0,ca=0,da=0,ea=0,fa=0,ga=0,ha=0,ia=0,ja=0,ka=0,la=0,ma=0,na=0,oa=0,pa=0,qa=0,ra=0,sa=0,ta=0;sa=i;i=i+480|0;qa=sa+96|0;ra=sa+32|0;m=sa+24|0;n=sa;na=c[e+4>>2]|0;u=c[e+8>>2]|0;Na(e,(Z(na,f)|0)+g|0);p=c[e>>2]|0;k=f<<4;l=g<<4;o=(Z(f<<8,na)|0)+l|0;c[b+20>>2]=40;c[b+8>>2]=0;c[b>>2]=6;c[b+12>>2]=0;c[b+16>>2]=0;c[b+24>>2]=0;do if((h|0)==2|(h|0)==7)id(qa,0,384);else{c[m>>2]=0;c[n+4>>2]=na;c[n+8>>2]=u;c[n>>2]=j;if(!j){id(qa,0,384);break}dc(qa,m,n,l,k,0,0,16,16);sc(e,qa);i=sa;return}while(0);id(ra,0,64);if((f|0)!=0?(c[b+((0-na|0)*216|0)+196>>2]|0)!=0:0){v=o-(na<<4)|0;E=v|1;D=v|3;E=(d[p+E>>0]|0)+(d[p+v>>0]|0)+(d[p+(E+1)>>0]|0)+(d[p+D>>0]|0)|0;$=v|7;D=(d[p+(D+2)>>0]|0)+(d[p+(D+1)>>0]|0)+(d[p+(D+3)>>0]|0)+(d[p+$>>0]|0)|0;F=(d[p+($+2)>>0]|0)+(d[p+($+1)>>0]|0)+(d[p+($+3)>>0]|0)+(d[p+($+4)>>0]|0)|0;v=(d[p+($+6)>>0]|0)+(d[p+($+5)>>0]|0)+(d[p+($+7)>>0]|0)+(d[p+(v|15)>>0]|0)|0;$=D+E|0;c[ra>>2]=F+$+(c[ra>>2]|0)+v;s=ra+4|0;c[s>>2]=$-F-v+(c[s>>2]|0);s=1}else{E=0;D=0;F=0;v=0;s=0}if((u+-1|0)!=(f|0)?(c[b+(na*216|0)+196>>2]|0)!=0:0){z=o+(na<<8)|0;w=z|1;x=z|3;w=(d[p+w>>0]|0)+(d[p+z>>0]|0)+(d[p+(w+1)>>0]|0)+(d[p+x>>0]|0)|0;r=z|7;x=(d[p+(x+2)>>0]|0)+(d[p+(x+1)>>0]|0)+(d[p+(x+3)>>0]|0)+(d[p+r>>0]|0)|0;y=(d[p+(r+2)>>0]|0)+(d[p+(r+1)>>0]|0)+(d[p+(r+3)>>0]|0)+(d[p+(r+4)>>0]|0)|0;z=(d[p+(r+6)>>0]|0)+(d[p+(r+5)>>0]|0)+(d[p+(r+7)>>0]|0)+(d[p+(z|15)>>0]|0)|0;r=x+w|0;c[ra>>2]=y+r+(c[ra>>2]|0)+z;t=ra+4|0;c[t>>2]=r-y-z+(c[t>>2]|0);t=1;r=s+1|0}else{t=0;w=0;x=0;y=0;z=0;r=s}if((g|0)!=0?(c[b+-20>>2]|0)!=0:0){_=o+-1|0;$=na<<4;j=na<<5;ma=na*48|0;C=(d[p+(_+$)>>0]|0)+(d[p+_>>0]|0)+(d[p+(_+j)>>0]|0)+(d[p+(_+ma)>>0]|0)|0;h=na<<6;_=_+h|0;B=(d[p+(_+$)>>0]|0)+(d[p+_>>0]|0)+(d[p+(_+j)>>0]|0)+(d[p+(_+ma)>>0]|0)|0;_=_+h|0;A=(d[p+(_+$)>>0]|0)+(d[p+_>>0]|0)+(d[p+(_+j)>>0]|0)+(d[p+(_+ma)>>0]|0)|0;h=_+h|0;ma=(d[p+(h+$)>>0]|0)+(d[p+h>>0]|0)+(d[p+(h+j)>>0]|0)+(d[p+(h+ma)>>0]|0)|0;h=B+C|0;c[ra>>2]=A+h+(c[ra>>2]|0)+ma;j=ra+16|0;c[j>>2]=h-A-ma+(c[j>>2]|0);j=r+1|0;h=1}else{j=r;C=0;B=0;A=0;ma=0;h=0}do if((na+-1|0)!=(g|0)?(c[b+412>>2]|0)!=0:0){$=o+16|0;n=na<<4;m=na<<5;o=na*48|0;b=(d[p+($+n)>>0]|0)+(d[p+$>>0]|0)+(d[p+($+m)>>0]|0)+(d[p+($+o)>>0]|0)|0;q=na<<6;$=$+q|0;l=(d[p+($+n)>>0]|0)+(d[p+$>>0]|0)+(d[p+($+m)>>0]|0)+(d[p+($+o)>>0]|0)|0;$=$+q|0;k=(d[p+($+n)>>0]|0)+(d[p+$>>0]|0)+(d[p+($+m)>>0]|0)+(d[p+($+o)>>0]|0)|0;q=$+q|0;o=(d[p+(q+n)>>0]|0)+(d[p+q>>0]|0)+(d[p+(q+m)>>0]|0)+(d[p+(q+o)>>0]|0)|0;p=j+1|0;q=h+1|0;j=l+b|0;c[ra>>2]=k+j+(c[ra>>2]|0)+o;m=ra+16|0;j=j-k-o+(c[m>>2]|0)|0;c[m>>2]=j;m=(r|0)==0;n=(h|0)!=0;if(!(m&n)){if(!m){m=1;j=p;h=q;l=21;break}}else c[ra+4>>2]=A+ma+B+C-b-l-k-o>>5;m=1;o=(s|0)!=0;b=(t|0)!=0;h=q;l=27}else l=17;while(0);if((l|0)==17){n=(h|0)!=0;if(!r){m=0;p=j;l=23}else{m=0;l=21}}if((l|0)==21){p=ra+4|0;c[p>>2]=c[p>>2]>>r+3;p=j;l=23}do if((l|0)==23){j=(h|0)==0;o=(s|0)!=0;b=(t|0)!=0;if(j&o&b){c[ra+16>>2]=F+v+D+E-z-y-x-w>>5;pa=m;h=p;oa=n;o=1;b=1;break}if(j){pa=m;h=p;oa=n}else{j=c[ra+16>>2]|0;l=27}}while(0);if((l|0)==27){c[ra+16>>2]=j>>h+3;pa=m;h=p;oa=n}if((h|0)==1)c[ra>>2]=c[ra>>2]>>4;else if((h|0)==2)c[ra>>2]=c[ra>>2]>>5;else if((h|0)==3)c[ra>>2]=(c[ra>>2]|0)*21>>10;else c[ra>>2]=c[ra>>2]>>6;Dc(ra);n=0;j=qa;m=ra;while(1){h=c[m+((n>>>2&3)<<2)>>2]|0;if((h|0)<0)h=0;else h=(h|0)>255?-1:h&255;a[j>>0]=h;h=n+1|0;if((h|0)==256)break;else{n=h;j=j+1|0;m=(h&63|0)==0?m+16|0:m}}ta=Z(u,na)|0;V=na<<3;Y=0-V|0;G=Y|1;_=G+1|0;$=Y|3;aa=$+1|0;ba=$+2|0;ca=$+3|0;da=Y|7;W=ra+4|0;ka=na<<6;H=ka|1;ea=H+1|0;fa=ka|3;ga=fa+1|0;ha=fa+2|0;ia=fa+3|0;ja=ka|7;I=V+-1|0;U=na<<4;J=U+-1|0;K=J+V|0;L=J+U|0;M=L+V|0;N=L+U|0;O=N+V|0;X=ra+16|0;P=V+8|0;Q=U|8;R=Q+V|0;S=Q+U|0;T=S+V|0;U=S+U|0;V=U+V|0;la=ta<<6;q=E;p=D;h=F;t=v;n=w;j=x;l=y;u=z;F=0;m=C;k=B;r=A;s=ma;E=(c[e>>2]|0)+((Z(f<<6,na)|0)+(g<<3)+(ta<<8))|0;while(1){id(ra,0,64);if(o){q=(d[E+G>>0]|0)+(d[E+Y>>0]|0)|0;p=(d[E+$>>0]|0)+(d[E+_>>0]|0)|0;z=(d[E+ba>>0]|0)+(d[E+aa>>0]|0)|0;A=(d[E+da>>0]|0)+(d[E+ca>>0]|0)|0;t=p+q|0;c[ra>>2]=z+t+(c[ra>>2]|0)+A;c[W>>2]=t-z-A+(c[W>>2]|0);t=1}else{z=h;A=t;t=0}if(b){B=(d[E+H>>0]|0)+(d[E+ka>>0]|0)|0;C=(d[E+fa>>0]|0)+(d[E+ea>>0]|0)|0;D=(d[E+ha>>0]|0)+(d[E+ga>>0]|0)|0;u=(d[E+ja>>0]|0)+(d[E+ia>>0]|0)|0;h=C+B|0;c[ra>>2]=D+h+(c[ra>>2]|0)+u;c[W>>2]=h-D-u+(c[W>>2]|0);h=t+1|0}else{B=n;C=j;D=l;h=t}if(oa){v=(d[E+I>>0]|0)+(d[E+-1>>0]|0)|0;w=(d[E+K>>0]|0)+(d[E+J>>0]|0)|0;x=(d[E+M>>0]|0)+(d[E+L>>0]|0)|0;y=(d[E+O>>0]|0)+(d[E+N>>0]|0)|0;t=w+v|0;c[ra>>2]=x+t+(c[ra>>2]|0)+y;c[X>>2]=t-x-y+(c[X>>2]|0);t=h+1|0;s=1}else{t=h;v=m;w=k;x=r;y=s;s=0}do if(pa){l=(d[E+P>>0]|0)+(d[E+8>>0]|0)|0;m=(d[E+R>>0]|0)+(d[E+Q>>0]|0)|0;j=(d[E+T>>0]|0)+(d[E+S>>0]|0)|0;n=(d[E+V>>0]|0)+(d[E+U>>0]|0)|0;t=t+1|0;s=s+1|0;k=m+l|0;c[ra>>2]=j+k+(c[ra>>2]|0)+n;k=k-j-n+(c[X>>2]|0)|0;c[X>>2]=k;r=(h|0)==0;if(!(r&oa))if(r){l=54;break}else{l=49;break}else{c[W>>2]=x+y+w+v-l-m-j-n>>4;l=54;break}}else if(!h){r=s;l=50}else l=49;while(0);if((l|0)==49){c[W>>2]=c[W>>2]>>h+2;r=s;l=50}do if((l|0)==50){l=0;s=(r|0)==0;if(s&o&b){c[X>>2]=z+A+p+q-u-D-C-B>>4;break}if(!s){k=c[X>>2]|0;s=r;l=54}}while(0);if((l|0)==54)c[X>>2]=k>>s+2;if((t|0)==1)c[ra>>2]=c[ra>>2]>>3;else if((t|0)==2)c[ra>>2]=c[ra>>2]>>4;else if((t|0)==3)c[ra>>2]=(c[ra>>2]|0)*21>>9;else c[ra>>2]=c[ra>>2]>>5;Dc(ra);s=0;r=qa+((F<<6)+256)|0;k=ra;while(1){t=c[k+((s>>>1&3)<<2)>>2]|0;if((t|0)<0)t=0;else t=(t|0)>255?-1:t&255;a[r>>0]=t;t=s+1|0;if((t|0)==64)break;else{s=t;r=r+1|0;k=(t&15|0)==0?k+16|0:k}}F=F+1|0;if((F|0)==2)break;else{h=z;t=A;n=B;j=C;l=D;m=v;k=w;r=x;s=y;E=E+la|0}}sc(e,qa);i=sa;return}function Dc(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,j=0,k=0;h=i;f=a+4|0;b=c[f>>2]|0;g=a+16|0;d=c[g>>2]|0;e=c[a>>2]|0;if(!(b|d)){c[a+60>>2]=e;c[a+56>>2]=e;c[a+52>>2]=e;c[a+48>>2]=e;c[a+44>>2]=e;c[a+40>>2]=e;c[a+36>>2]=e;c[a+32>>2]=e;c[a+28>>2]=e;c[a+24>>2]=e;c[a+20>>2]=e;c[g>>2]=e;c[a+12>>2]=e;c[a+8>>2]=e;c[f>>2]=e;i=h;return}else{k=b+e|0;g=b>>1;j=g+e|0;g=e-g|0;b=e-b|0;c[a>>2]=d+k;e=d>>1;c[a+16>>2]=e+k;c[a+32>>2]=k-e;c[a+48>>2]=k-d;c[f>>2]=d+j;c[a+20>>2]=e+j;c[a+36>>2]=j-e;c[a+52>>2]=j-d;c[a+8>>2]=d+g;c[a+24>>2]=e+g;c[a+40>>2]=g-e;c[a+56>>2]=g-d;c[a+12>>2]=d+b;c[a+28>>2]=e+b;c[a+44>>2]=b-e;c[a+60>>2]=b-d;i=h;return}}function Ec(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0;h=i;id(b,0,952);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b>>2]=d&1;do if(d){d=jb(a,8)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+4>>2]=d;if((d|0)==255){d=jb(a,16)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+8>>2]=d;d=jb(a,16)|0;if((d|0)==-1){d=1;i=h;return d|0}else{c[b+12>>2]=d;break}}}while(0);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+16>>2]=d&1;do if(d){d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}else{c[b+20>>2]=(d|0)==1&1;break}}while(0);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+24>>2]=d&1;do if(d){d=jb(a,3)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+28>>2]=d;d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+32>>2]=(d|0)==1&1;d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+36>>2]=d&1;if(!d){c[b+40>>2]=2;c[b+44>>2]=2;c[b+48>>2]=2;break}d=jb(a,8)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+40>>2]=d;d=jb(a,8)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+44>>2]=d;d=jb(a,8)|0;if((d|0)==-1){d=1;i=h;return d|0}else{c[b+48>>2]=d;break}}else{c[b+28>>2]=5;c[b+40>>2]=2;c[b+44>>2]=2;c[b+48>>2]=2}while(0);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+52>>2]=d&1;if(d){d=b+56|0;e=nb(a,d)|0;if(e){d=e;i=h;return d|0}if((c[d>>2]|0)>>>0>5){d=1;i=h;return d|0}d=b+60|0;e=nb(a,d)|0;if(e){d=e;i=h;return d|0}if((c[d>>2]|0)>>>0>5){d=1;i=h;return d|0}}d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+64>>2]=d&1;do if(d){d=kb(a)|0;if((lb(a,32)|0)==-1|(d|0)==0){d=1;i=h;return d|0}c[b+68>>2]=d;d=kb(a)|0;if((lb(a,32)|0)==-1|(d|0)==0){d=1;i=h;return d|0}c[b+72>>2]=d;d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}else{c[b+76>>2]=(d|0)==1&1;break}}while(0);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;f=b+80|0;c[f>>2]=d&1;if(d){e=Fc(a,b+84|0)|0;if(e){d=e;i=h;return d|0}}else{c[b+84>>2]=1;c[b+96>>2]=288000001;c[b+224>>2]=288000001;c[b+480>>2]=24;c[b+484>>2]=24;c[b+488>>2]=24;c[b+492>>2]=24}e=jb(a,1)|0;if((e|0)==-1){d=1;i=h;return d|0}e=(e|0)==1;d=b+496|0;c[d>>2]=e&1;if(e){e=Fc(a,b+500|0)|0;if(e){d=e;i=h;return d|0}}else{c[b+500>>2]=1;c[b+512>>2]=240000001;c[b+640>>2]=240000001;c[b+896>>2]=24;c[b+900>>2]=24;c[b+904>>2]=24;c[b+908>>2]=24}if(!((c[f>>2]|0)==0?(c[d>>2]|0)==0:0))g=46;do if((g|0)==46){d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}else{c[b+912>>2]=(d|0)==1&1;break}}while(0);d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+916>>2]=(d|0)==1&1;d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}d=(d|0)==1;c[b+920>>2]=d&1;do if(d){d=jb(a,1)|0;if((d|0)==-1){d=1;i=h;return d|0}c[b+924>>2]=(d|0)==1&1;e=b+928|0;d=nb(a,e)|0;if(d){i=h;return d|0}if((c[e>>2]|0)>>>0>16){d=1;i=h;return d|0}e=b+932|0;d=nb(a,e)|0;if(d){i=h;return d|0}if((c[e>>2]|0)>>>0>16){d=1;i=h;return d|0}e=b+936|0;d=nb(a,e)|0;if(d){i=h;return d|0}if((c[e>>2]|0)>>>0>16){d=1;i=h;return d|0}e=b+940|0;d=nb(a,e)|0;if(d){i=h;return d|0}if((c[e>>2]|0)>>>0>16){d=1;i=h;return d|0}d=nb(a,b+944|0)|0;if(d){i=h;return d|0}d=nb(a,b+948|0)|0;if(!d)break;i=h;return d|0}else{c[b+924>>2]=1;c[b+928>>2]=2;c[b+932>>2]=1;c[b+936>>2]=16;c[b+940>>2]=16;c[b+944>>2]=16;c[b+948>>2]=16}while(0);d=0;i=h;return d|0}function Fc(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,j=0,k=0;k=i;d=nb(a,b)|0;if(d){i=k;return d|0}d=(c[b>>2]|0)+1|0;c[b>>2]=d;if(d>>>0>32){d=1;i=k;return d|0}d=jb(a,4)|0;if((d|0)==-1){d=1;i=k;return d|0}j=b+4|0;c[j>>2]=d;e=jb(a,4)|0;if((e|0)==-1){d=1;i=k;return d|0}h=b+8|0;c[h>>2]=e;a:do if(c[b>>2]|0){g=0;while(1){f=b+(g<<2)+12|0;d=nb(a,f)|0;if(d){e=17;break}e=c[f>>2]|0;if((e|0)==-1){d=1;e=17;break}d=e+1|0;c[f>>2]=d;c[f>>2]=d<<(c[j>>2]|0)+6;f=b+(g<<2)+140|0;d=nb(a,f)|0;if(d){e=17;break}e=c[f>>2]|0;if((e|0)==-1){d=1;e=17;break}e=e+1|0;c[f>>2]=e;c[f>>2]=e<<(c[h>>2]|0)+4;e=jb(a,1)|0;if((e|0)==-1){d=1;e=17;break}c[b+(g<<2)+268>>2]=(e|0)==1&1;g=g+1|0;if(g>>>0>=(c[b>>2]|0)>>>0)break a}if((e|0)==17){i=k;return d|0}}while(0);d=jb(a,5)|0;if((d|0)==-1){d=1;i=k;return d|0}c[b+396>>2]=d+1;d=jb(a,5)|0;if((d|0)==-1){d=1;i=k;return d|0}c[b+400>>2]=d+1;d=jb(a,5)|0;if((d|0)==-1){d=1;i=k;return d|0}c[b+404>>2]=d+1;d=jb(a,5)|0;if((d|0)==-1){d=1;i=k;return d|0}c[b+408>>2]=d;d=0;i=k;return d|0}function Gc(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0;p=i;a:do if(!(c[d+284>>2]|0))o=0;else{h=0;while(1){j=c[d+(h*20|0)+288>>2]|0;if((j|0)==5){o=1;break a}else if(!j)break;h=h+1|0}o=0}while(0);j=c[b+16>>2]|0;if((j|0)==1){if((c[e>>2]|0)!=5){f=c[a+12>>2]|0;if((c[a+8>>2]|0)>>>0>(c[d+12>>2]|0)>>>0)f=(c[b+12>>2]|0)+f|0}else f=0;m=c[b+36>>2]|0;h=(m|0)==0;if(h)j=0;else j=(c[d+12>>2]|0)+f|0;e=(c[e+4>>2]|0)==0;k=((e&(j|0)!=0)<<31>>31)+j|0;l=(k|0)!=0;if(l){g=k+-1|0;n=(g>>>0)%(m>>>0)|0;g=(g>>>0)/(m>>>0)|0}else{n=0;g=0}if(h)j=0;else{k=c[b+40>>2]|0;j=0;h=0;do{j=(c[k+(h<<2)>>2]|0)+j|0;h=h+1|0}while(h>>>0<m>>>0)}if(l){g=Z(j,g)|0;k=c[b+40>>2]|0;j=0;do{g=(c[k+(j<<2)>>2]|0)+g|0;j=j+1|0}while(j>>>0<=n>>>0)}else g=0;if(e)j=(c[b+28>>2]|0)+g|0;else j=g;g=(c[d+32>>2]|0)+(c[b+32>>2]|0)|0;h=a+12|0;if(!o){b=((g|0)<0?g:0)+j+(c[d+28>>2]|0)|0;c[h>>2]=f;c[a+8>>2]=c[d+12>>2];i=p;return b|0}else{c[h>>2]=0;c[a+8>>2]=0;b=0;i=p;return b|0}}else if(!j){if((c[e>>2]|0)!=5){h=c[a>>2]|0;j=c[d+20>>2]|0;if(h>>>0>j>>>0?(k=c[b+20>>2]|0,(h-j|0)>>>0>=k>>>1>>>0):0){h=(c[a+4>>2]|0)+k|0;k=a}else{k=a;m=11}}else{c[a+4>>2]=0;c[a>>2]=0;j=c[d+20>>2]|0;h=0;k=a;m=11}do if((m|0)==11){if(j>>>0>h>>>0?(g=c[b+20>>2]|0,(j-h|0)>>>0>g>>>1>>>0):0){h=(c[a+4>>2]|0)-g|0;break}h=c[a+4>>2]|0}while(0);if(!(c[e+4>>2]|0)){b=c[d+24>>2]|0;b=j+h+((b|0)<0?b:0)|0;i=p;return b|0}c[a+4>>2]=h;f=c[d+24>>2]|0;g=(f|0)<0;if(!o){c[k>>2]=j;b=j+h+(g?f:0)|0;i=p;return b|0}else{c[a+4>>2]=0;c[k>>2]=g?0-f|0:0;b=0;i=p;return b|0}}else{if((c[e>>2]|0)==5){k=0;g=0;f=a+12|0}else{j=c[d+12>>2]|0;f=a+12|0;h=c[f>>2]|0;if((c[a+8>>2]|0)>>>0>j>>>0)h=(c[b+12>>2]|0)+h|0;k=h;g=(j+h<<1)+(((c[e+4>>2]|0)==0)<<31>>31)|0}if(!o){c[f>>2]=k;c[a+8>>2]=c[d+12>>2];b=g;i=p;return b|0}else{c[f>>2]=0;c[a+8>>2]=0;b=0;i=p;return b|0}}return 0}function Hc(a,b){a=a|0;b=b|0;var d=0,e=0;d=i;Ab(a);e=fd(2112)|0;c[a+3376>>2]=e;if(e)if(!b)b=0;else{c[a+1216>>2]=1;b=0}else b=1;i=d;return b|0}function Ic(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0;r=i;i=i+208|0;l=r+204|0;p=r;g=r+112|0;h=r+40|0;q=r+16|0;j=r+12|0;n=r+8|0;c[j>>2]=0;o=a+3344|0;if((c[o>>2]|0)!=0?(c[a+3348>>2]|0)==(b|0):0){b=a+3356|0;c[q+0>>2]=c[b+0>>2];c[q+4>>2]=c[b+4>>2];c[q+8>>2]=c[b+8>>2];c[q+12>>2]=c[b+12>>2];c[q+4>>2]=c[q>>2];c[q+8>>2]=0;c[q+16>>2]=0;c[f>>2]=c[a+3352>>2]}else k=4;do if((k|0)==4)if(!(Pa(b,d,q,f)|0)){d=a+3356|0;c[d+0>>2]=c[q+0>>2];c[d+4>>2]=c[q+4>>2];c[d+8>>2]=c[q+8>>2];c[d+12>>2]=c[q+12>>2];c[d+16>>2]=c[q+16>>2];c[a+3352>>2]=c[f>>2];c[a+3348>>2]=b;break}else{n=3;i=r;return n|0}while(0);c[o>>2]=0;if(sb(q,p)|0){n=3;i=r;return n|0}if(((c[p>>2]|0)+-1|0)>>>0>11){n=0;i=r;return n|0}b=Ib(q,p,a,j)|0;if(!b){do if(!(c[j>>2]|0))k=19;else{if((c[a+1184>>2]|0)!=0?(c[a+16>>2]|0)!=0:0){if(c[a+3380>>2]|0){n=3;i=r;return n|0}if(!(c[a+1188>>2]|0)){m=a+1220|0;n=a+1336|0;c[n>>2]=jc(m)|0;nc(m);Bc(a,n,0)|0}else Bc(a,a+1336|0,c[a+1372>>2]|0)|0;c[f>>2]=0;c[o>>2]=1;c[a+1180>>2]=0;g=a+1336|0;b=a+1360|0;break}c[a+1188>>2]=0;c[a+1180>>2]=0;k=19}while(0);do if((k|0)==19){b=c[p>>2]|0;if((b|0)==7)if(!(Qa(q,g)|0)){Bb(a,g)|0;n=0;i=r;return n|0}else{n=g+40|0;gd(c[n>>2]|0);c[n>>2]=0;n=g+84|0;gd(c[n>>2]|0);c[n>>2]=0;n=3;i=r;return n|0}else if((b|0)==1|(b|0)==5){k=a+1180|0;if(c[a+1180>>2]|0){n=0;i=r;return n|0}c[a+1184>>2]=1;if(Fb(a)|0){c[a+1204>>2]=0;c[a+1208>>2]=e;Ua(q,l)|0;j=a+8|0;d=c[j>>2]|0;b=Db(a,c[l>>2]|0,(c[p>>2]|0)==5&1)|0;if(b){c[a+4>>2]=256;c[a+12>>2]=0;c[j>>2]=32;c[a+16>>2]=0;c[a+3380>>2]=0;n=(b|0)==65535?5:4;i=r;return n|0}if((d|0)!=(c[j>>2]|0)){d=c[a+16>>2]|0;c[n>>2]=1;b=c[a>>2]|0;if(b>>>0<32)b=c[a+(b<<2)+20>>2]|0;else b=0;c[f>>2]=0;c[o>>2]=1;if((((((c[p>>2]|0)==5?(l=_a(n,q,d,c[a+12>>2]|0,5)|0,(c[n>>2]|l|0)==0):0)?(m=a+1220|0,!((c[a+1276>>2]|0)!=0|(b|0)==0)):0)?(c[b+52>>2]|0)==(c[d+52>>2]|0):0)?(c[b+56>>2]|0)==(c[d+56>>2]|0):0)?(c[b+88>>2]|0)==(c[d+88>>2]|0):0)qc(m);else c[a+1280>>2]=0;c[a>>2]=c[j>>2];n=2;i=r;return n|0}}if(c[a+3380>>2]|0){n=3;i=r;return n|0}h=a+1368|0;j=a+2356|0;b=a+16|0;if(Ta(q,j,c[b>>2]|0,c[a+12>>2]|0,p)|0){n=3;i=r;return n|0}if(!(Fb(a)|0))d=a+1220|0;else{d=a+1220|0;if((c[p>>2]|0)!=5?(oc(d,c[a+2368>>2]|0,(c[p+4>>2]|0)!=0&1,c[(c[b>>2]|0)+48>>2]|0)|0)!=0:0){n=3;i=r;return n|0}c[a+1336>>2]=jc(d)|0}od(h|0,j|0,988)|0;c[a+1188>>2]=1;b=a+1360|0;l=p;m=c[l+4>>2]|0;n=b;c[n>>2]=c[l>>2];c[n+4>>2]=m;Hb(a,c[a+1432>>2]|0);nc(d);if(gc(d,a+1436|0,c[a+1380>>2]|0,c[a+1412>>2]|0)|0){n=3;i=r;return n|0}g=a+1336|0;if($a(q,a,g,h)|0){ab(a,c[h>>2]|0);n=3;i=r;return n|0}if(!(Gb(a)|0)){n=0;i=r;return n|0}else{c[k>>2]=1;break}}else if((b|0)==8)if(!(Sa(q,h)|0)){Cb(a,h)|0;n=0;i=r;return n|0}else{n=h+20|0;gd(c[n>>2]|0);c[n>>2]=0;n=h+24|0;gd(c[n>>2]|0);c[n>>2]=0;n=h+28|0;gd(c[n>>2]|0);c[n>>2]=0;n=h+44|0;gd(c[n>>2]|0);c[n>>2]=0;n=3;i=r;return n|0}else{n=0;i=r;return n|0}}while(0);uc(g,c[a+1212>>2]|0);Eb(a);j=Gc(a+1284|0,c[a+16>>2]|0,a+1368|0,b)|0;d=a+1188|0;do if(c[d>>2]|0){h=a+1220|0;if(!(c[a+1364>>2]|0)){hc(h,0,g,c[a+1380>>2]|0,j,(c[b>>2]|0)==5&1,c[a+1208>>2]|0,c[a+1204>>2]|0)|0;break}else{hc(h,a+1644|0,g,c[a+1380>>2]|0,j,(c[b>>2]|0)==5&1,c[a+1208>>2]|0,c[a+1204>>2]|0)|0;break}}while(0);c[a+1184>>2]=0;c[d>>2]=0;n=1;i=r;return n|0}else if((b|0)==65520){n=4;i=r;return n|0}else{n=3;i=r;return n|0}return 0}function Jc(a){a=a|0;var b=0,d=0,e=0,f=0;f=i;e=0;do{d=a+(e<<2)+20|0;b=c[d>>2]|0;if(b){gd(c[b+40>>2]|0);c[(c[d>>2]|0)+40>>2]=0;gd(c[(c[d>>2]|0)+84>>2]|0);c[(c[d>>2]|0)+84>>2]=0;gd(c[d>>2]|0);c[d>>2]=0}e=e+1|0}while((e|0)!=32);e=0;do{d=a+(e<<2)+148|0;b=c[d>>2]|0;if(b){gd(c[b+20>>2]|0);c[(c[d>>2]|0)+20>>2]=0;gd(c[(c[d>>2]|0)+24>>2]|0);c[(c[d>>2]|0)+24>>2]=0;gd(c[(c[d>>2]|0)+28>>2]|0);c[(c[d>>2]|0)+28>>2]=0;gd(c[(c[d>>2]|0)+44>>2]|0);c[(c[d>>2]|0)+44>>2]=0;gd(c[d>>2]|0);c[d>>2]=0}e=e+1|0}while((e|0)!=256);b=a+3376|0;gd(c[b>>2]|0);c[b>>2]=0;b=a+1212|0;gd(c[b>>2]|0);c[b>>2]=0;b=a+1172|0;gd(c[b>>2]|0);c[b>>2]=0;mc(a+1220|0);i=f;return}function Kc(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0;f=i;a=pc(a+1220|0)|0;if(!a){a=0;i=f;return a|0}c[b>>2]=c[a+4>>2];c[d>>2]=c[a+12>>2];c[e>>2]=c[a+8>>2];a=c[a>>2]|0;i=f;return a|0}function Lc(a){a=a|0;var b=0;b=i;a=c[a+16>>2]|0;if(!a){a=0;i=b;return a|0}a=c[a+52>>2]|0;i=b;return a|0}function Mc(a){a=a|0;var b=0;b=i;a=c[a+16>>2]|0;if(!a){a=0;i=b;return a|0}a=c[a+56>>2]|0;i=b;return a|0}function Nc(a){a=a|0;var b=0;b=i;qc(a+1220|0);i=b;return}function Oc(a){a=a|0;var b=0;b=i;a=(Jb(a)|0)==0&1;i=b;return a|0}function Pc(a){a=a|0;var b=0,d=0;d=i;a=c[a+16>>2]|0;if(((((a|0)!=0?(c[a+80>>2]|0)!=0:0)?(b=c[a+84>>2]|0,(b|0)!=0):0)?(c[b+24>>2]|0)!=0:0)?(c[b+32>>2]|0)!=0:0){a=1;i=d;return a|0}a=0;i=d;return a|0}function Qc(a){a=a|0;var b=0,d=0;d=i;a=c[a+16>>2]|0;if(((((a|0)!=0?(c[a+80>>2]|0)!=0:0)?(b=c[a+84>>2]|0,(b|0)!=0):0)?(c[b+24>>2]|0)!=0:0)?(c[b+36>>2]|0)!=0:0)a=c[b+48>>2]|0;else a=2;i=d;return a|0}function Rc(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0;h=i;a=c[a+16>>2]|0;if((a|0)!=0?(c[a+60>>2]|0)!=0:0){c[b>>2]=1;b=a+64|0;c[d>>2]=c[b>>2]<<1;c[e>>2]=(c[a+52>>2]<<4)-((c[a+68>>2]|0)+(c[b>>2]|0)<<1);b=a+72|0;c[f>>2]=c[b>>2]<<1;a=(c[a+56>>2]<<4)-((c[a+76>>2]|0)+(c[b>>2]|0)<<1)|0;c[g>>2]=a;i=h;return}c[b>>2]=0;c[d>>2]=0;c[e>>2]=0;c[f>>2]=0;a=0;c[g>>2]=a;i=h;return}function Sc(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;f=i;a=c[a+16>>2]|0;a:do if((((a|0)!=0?(c[a+80>>2]|0)!=0:0)?(e=c[a+84>>2]|0,(e|0)!=0):0)?(c[e>>2]|0)!=0:0){a=c[e+4>>2]|0;do switch(a|0){case 8:{e=11;a=32;break a}case 13:{e=99;a=160;break a}case 12:{e=33;a=64;break a}case 6:{e=11;a=24;break a}case 7:{e=11;a=20;break a}case 255:{a=c[e+8>>2]|0;e=c[e+12>>2]|0;g=(a|0)==0|(e|0)==0;e=g?0:e;a=g?0:a;break a}case 5:{e=33;a=40;break a}case 4:{e=11;a=16;break a}case 3:{e=11;a=10;break a}case 1:case 0:{e=a;break a}case 2:{e=11;a=12;break a}case 10:{e=11;a=18;break a}case 9:{e=33;a=80;break a}case 11:{e=11;a=15;break a}default:{e=0;a=0;break a}}while(0)}else{e=1;a=1}while(0);c[b>>2]=a;c[d>>2]=e;i=f;return}function Tc(a){a=a|0;a=c[a+16>>2]|0;if(!a)a=0;else a=c[a>>2]|0;return a|0}function Uc(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;f=i;do if(a){d=fd(3396)|0;if(d){e=d+8|0;if(!(Hc(e,b)|0)){c[d>>2]=1;c[d+4>>2]=0;c[a>>2]=d;d=0;break}else{Jc(e);gd(d);d=-4;break}}else d=-4}else d=-1;while(0);i=f;return d|0}function Vc(a,b){a=a|0;b=b|0;var d=0,e=0;e=i;if((a|0)==0|(b|0)==0){a=-1;i=e;return a|0}d=a+8|0;if(!(c[a+24>>2]|0)){a=-6;i=e;return a|0}if(!(c[a+20>>2]|0)){a=-6;i=e;return a|0}c[b+4>>2]=(Lc(d)|0)<<4;c[b+8>>2]=(Mc(d)|0)<<4;c[b+12>>2]=Pc(d)|0;c[b+16>>2]=Qc(d)|0;Rc(d,b+28|0,b+32|0,b+36|0,b+40|0,b+44|0);Sc(d,b+20|0,b+24|0);c[b>>2]=Tc(d)|0;a=0;i=e;return a|0}function Wc(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0;m=i;i=i+16|0;j=m;a:do if((!((b|0)==0|(d|0)==0)?(f=c[b>>2]|0,(f|0)!=0):0)?(g=c[b+4>>2]|0,(g|0)!=0):0)if((a|0)!=0?(e=c[a>>2]|0,(e|0)!=0):0){c[d>>2]=0;c[j>>2]=0;k=a+8|0;c[a+3392>>2]=c[b+12>>2];h=b+8|0;b=1;while(1){if((e|0)==2){l=8;break}e=Ic(k,f,g,c[h>>2]|0,j)|0;n=c[j>>2]|0;f=f+n|0;g=g-n|0;g=(g|0)<0?0:g;c[d>>2]=f;if((e|0)==5){b=-4;break a}else if((e|0)==4){e=(Oc(k)|0|g|0)==0;b=e?-2:b}else if((e|0)==2)break;else if((e|0)==1){l=13;break}if(!g)break a;e=c[a>>2]|0}if((l|0)==8){c[a>>2]=1;c[d>>2]=f+(c[j>>2]|0)}else if((l|0)==13){b=a+4|0;c[b>>2]=(c[b>>2]|0)+1;b=(g|0)==0?2:3;break}b=a+1288|0;if((c[b>>2]|0)!=0?(c[a+1244>>2]|0)!=(c[a+1248>>2]|0):0){c[b>>2]=0;c[a>>2]=2;b=3}else b=4}else b=-3;else b=-1;while(0);i=m;return b|0}function Xc(a){a=a|0;c[a>>2]=2;c[a+4>>2]=3;return}function Yc(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0;h=i;i=i+16|0;f=h+8|0;e=h+4|0;g=h;if((a|0)==0|(b|0)==0){a=-1;i=h;return a|0}a=a+8|0;if(d)Nc(a);a=Kc(a,g,e,f)|0;if(!a){a=0;i=h;return a|0}c[b>>2]=a;c[b+4>>2]=c[g>>2];c[b+8>>2]=c[e>>2];c[b+12>>2]=c[f>>2];a=2;i=h;return a|0}function Zc(a){a=a|0;var b=0,d=0;d=i;b=jd(a)|0;c[1792]=b;c[1791]=b;c[1790]=a;c[1793]=b+a;i=d;return b|0}function _c(a){a=a|0;c[1790]=a;return}function $c(){var a=0;a=i;c[1786]=c[1791];c[1787]=c[1790];do bd()|0;while((c[1787]|0)!=0);i=a;return}function ad(){var a=0,b=0;b=i;if(Uc(7176,0)|0){da(7280)|0;a=c[1784]|0;if(a)kd(a)}else{c[1796]=1;c[1798]=1}i=b;return -1}function bd(){var a=0,b=0,d=0;b=i;c[1788]=c[1798];a=Wc(c[1794]|0,7144,7200)|0;switch(a|0){case 1:case -2:{c[1787]=0;i=b;return a|0}case 4:{if(Vc(c[1794]|0,7208)|0){a=-1;i=b;return a|0}c[1814]=(Z((c[1803]|0)*3|0,c[1804]|0)|0)>>>1;ra();a=c[1800]|0;c[1787]=(c[1786]|0)-a+(c[1787]|0);c[1786]=a;a=0;i=b;return a|0}case 2:{c[1787]=0;break}case 3:{d=c[1800]|0;c[1787]=(c[1786]|0)-d+(c[1787]|0);c[1786]=d;break}default:{i=b;return a|0}}c[1798]=(c[1798]|0)+1;if((Yc(c[1794]|0,7264,0)|0)!=2){i=b;return a|0}do{c[1796]=(c[1796]|0)+1;ca(c[1816]|0,c[1803]|0,c[1804]|0)}while((Yc(c[1794]|0,7264,0)|0)==2);i=b;return a|0}function cd(){var a=0,b=0;b=i;a=c[1784]|0;if(a)kd(a);i=b;return}function dd(){var a=0,b=0;b=i;i=i+16|0;a=b;Xc(a);i=b;return c[a>>2]|0}function ed(){var a=0,b=0;b=i;i=i+16|0;a=b;Xc(a);i=b;return c[a+4>>2]|0}function fd(a){a=a|0;var b=0;b=i;a=jd(a)|0;i=b;return a|0}function gd(a){a=a|0;var b=0;b=i;kd(a);i=b;return}function hd(a,b,c){a=a|0;b=b|0;c=c|0;var d=0;d=i;od(a|0,b|0,c|0)|0;i=d;return}function id(a,b,c){a=a|0;b=b|0;c=c|0;var d=0;d=i;nd(a|0,b&255|0,c|0)|0;i=d;return}function jd(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0;L=i;do if(a>>>0<245){if(a>>>0<11)p=16;else p=a+11&-8;a=p>>>3;l=c[1828]|0;k=l>>>a;if(k&3){g=(k&1^1)+a|0;b=g<<1;h=7352+(b<<2)|0;b=7352+(b+2<<2)|0;e=c[b>>2]|0;j=e+8|0;f=c[j>>2]|0;do if((h|0)!=(f|0)){if(f>>>0<(c[1832]|0)>>>0)ka();d=f+12|0;if((c[d>>2]|0)==(e|0)){c[d>>2]=h;c[b>>2]=f;break}else ka()}else c[1828]=l&~(1<<g);while(0);x=g<<3;c[e+4>>2]=x|3;x=e+(x|4)|0;c[x>>2]=c[x>>2]|1;x=j;i=L;return x|0}j=c[1830]|0;if(p>>>0>j>>>0){if(k){g=2<<a;g=k<<a&(g|0-g);g=(g&0-g)+-1|0;a=g>>>12&16;g=g>>>a;h=g>>>5&8;g=g>>>h;d=g>>>2&4;g=g>>>d;e=g>>>1&2;g=g>>>e;f=g>>>1&1;f=(h|a|d|e|f)+(g>>>f)|0;g=f<<1;e=7352+(g<<2)|0;g=7352+(g+2<<2)|0;d=c[g>>2]|0;a=d+8|0;h=c[a>>2]|0;do if((e|0)!=(h|0)){if(h>>>0<(c[1832]|0)>>>0)ka();j=h+12|0;if((c[j>>2]|0)==(d|0)){c[j>>2]=e;c[g>>2]=h;m=c[1830]|0;break}else ka()}else{c[1828]=l&~(1<<f);m=j}while(0);x=f<<3;k=x-p|0;c[d+4>>2]=p|3;b=d+p|0;c[d+(p|4)>>2]=k|1;c[d+x>>2]=k;if(m){e=c[1833]|0;g=m>>>3;h=g<<1;f=7352+(h<<2)|0;j=c[1828]|0;g=1<<g;if(j&g){j=7352+(h+2<<2)|0;h=c[j>>2]|0;if(h>>>0<(c[1832]|0)>>>0)ka();else{n=j;o=h}}else{c[1828]=j|g;n=7352+(h+2<<2)|0;o=f}c[n>>2]=e;c[o+12>>2]=e;c[e+8>>2]=o;c[e+12>>2]=f}c[1830]=k;c[1833]=b;x=a;i=L;return x|0}k=c[1829]|0;if(k){l=(k&0-k)+-1|0;w=l>>>12&16;l=l>>>w;v=l>>>5&8;l=l>>>v;x=l>>>2&4;l=l>>>x;j=l>>>1&2;l=l>>>j;m=l>>>1&1;m=c[7616+((v|w|x|j|m)+(l>>>m)<<2)>>2]|0;l=(c[m+4>>2]&-8)-p|0;j=m;while(1){d=c[j+16>>2]|0;if(!d){d=c[j+20>>2]|0;if(!d)break}j=(c[d+4>>2]&-8)-p|0;x=j>>>0<l>>>0;l=x?j:l;j=d;m=x?d:m}k=c[1832]|0;if(m>>>0<k>>>0)ka();b=m+p|0;if(m>>>0>=b>>>0)ka();a=c[m+24>>2]|0;g=c[m+12>>2]|0;do if((g|0)==(m|0)){h=m+20|0;j=c[h>>2]|0;if(!j){h=m+16|0;j=c[h>>2]|0;if(!j){e=0;break}}while(1){f=j+20|0;g=c[f>>2]|0;if(g){j=g;h=f;continue}f=j+16|0;g=c[f>>2]|0;if(!g)break;else{j=g;h=f}}if(h>>>0<k>>>0)ka();else{c[h>>2]=0;e=j;break}}else{f=c[m+8>>2]|0;if(f>>>0<k>>>0)ka();j=f+12|0;if((c[j>>2]|0)!=(m|0))ka();h=g+8|0;if((c[h>>2]|0)==(m|0)){c[j>>2]=g;c[h>>2]=f;e=g;break}else ka()}while(0);do if(a){j=c[m+28>>2]|0;h=7616+(j<<2)|0;if((m|0)==(c[h>>2]|0)){c[h>>2]=e;if(!e){c[1829]=c[1829]&~(1<<j);break}}else{if(a>>>0<(c[1832]|0)>>>0)ka();j=a+16|0;if((c[j>>2]|0)==(m|0))c[j>>2]=e;else c[a+20>>2]=e;if(!e)break}h=c[1832]|0;if(e>>>0<h>>>0)ka();c[e+24>>2]=a;j=c[m+16>>2]|0;do if(j)if(j>>>0<h>>>0)ka();else{c[e+16>>2]=j;c[j+24>>2]=e;break}while(0);f=c[m+20>>2]|0;if(f)if(f>>>0<(c[1832]|0)>>>0)ka();else{c[e+20>>2]=f;c[f+24>>2]=e;break}}while(0);if(l>>>0<16){x=l+p|0;c[m+4>>2]=x|3;x=m+(x+4)|0;c[x>>2]=c[x>>2]|1}else{c[m+4>>2]=p|3;c[m+(p|4)>>2]=l|1;c[m+(l+p)>>2]=l;d=c[1830]|0;if(d){e=c[1833]|0;g=d>>>3;h=g<<1;f=7352+(h<<2)|0;j=c[1828]|0;g=1<<g;if(j&g){j=7352+(h+2<<2)|0;h=c[j>>2]|0;if(h>>>0<(c[1832]|0)>>>0)ka();else{r=j;q=h}}else{c[1828]=j|g;r=7352+(h+2<<2)|0;q=f}c[r>>2]=e;c[q+12>>2]=e;c[e+8>>2]=q;c[e+12>>2]=f}c[1830]=l;c[1833]=b}x=m+8|0;i=L;return x|0}}}else if(a>>>0<=4294967231){a=a+11|0;p=a&-8;m=c[1829]|0;if(m){h=0-p|0;a=a>>>8;if(a)if(p>>>0>16777215)l=31;else{q=(a+1048320|0)>>>16&8;r=a<<q;o=(r+520192|0)>>>16&4;r=r<<o;l=(r+245760|0)>>>16&2;l=14-(o|q|l)+(r<<l>>>15)|0;l=p>>>(l+7|0)&1|l<<1}else l=0;j=c[7616+(l<<2)>>2]|0;a:do if(!j){a=0;k=0}else{if((l|0)==31)k=0;else k=25-(l>>>1)|0;f=h;a=0;e=p<<k;k=0;while(1){g=c[j+4>>2]&-8;h=g-p|0;if(h>>>0<f>>>0)if((g|0)==(p|0)){a=j;k=j;break a}else k=j;else h=f;r=c[j+20>>2]|0;j=c[j+(e>>>31<<2)+16>>2]|0;a=(r|0)==0|(r|0)==(j|0)?a:r;if(!j)break;else{f=h;e=e<<1}}}while(0);if((a|0)==0&(k|0)==0){a=2<<l;a=m&(a|0-a);if(!a)break;r=(a&0-a)+-1|0;n=r>>>12&16;r=r>>>n;m=r>>>5&8;r=r>>>m;o=r>>>2&4;r=r>>>o;q=r>>>1&2;r=r>>>q;a=r>>>1&1;a=c[7616+((m|n|o|q|a)+(r>>>a)<<2)>>2]|0}if(!a){n=h;m=k}else while(1){r=(c[a+4>>2]&-8)-p|0;j=r>>>0<h>>>0;h=j?r:h;k=j?a:k;j=c[a+16>>2]|0;if(j){a=j;continue}a=c[a+20>>2]|0;if(!a){n=h;m=k;break}}if((m|0)!=0?n>>>0<((c[1830]|0)-p|0)>>>0:0){k=c[1832]|0;if(m>>>0<k>>>0)ka();o=m+p|0;if(m>>>0>=o>>>0)ka();a=c[m+24>>2]|0;g=c[m+12>>2]|0;do if((g|0)==(m|0)){h=m+20|0;j=c[h>>2]|0;if(!j){h=m+16|0;j=c[h>>2]|0;if(!j){b=0;break}}while(1){f=j+20|0;g=c[f>>2]|0;if(g){j=g;h=f;continue}f=j+16|0;g=c[f>>2]|0;if(!g)break;else{j=g;h=f}}if(h>>>0<k>>>0)ka();else{c[h>>2]=0;b=j;break}}else{f=c[m+8>>2]|0;if(f>>>0<k>>>0)ka();j=f+12|0;if((c[j>>2]|0)!=(m|0))ka();h=g+8|0;if((c[h>>2]|0)==(m|0)){c[j>>2]=g;c[h>>2]=f;b=g;break}else ka()}while(0);do if(a){j=c[m+28>>2]|0;h=7616+(j<<2)|0;if((m|0)==(c[h>>2]|0)){c[h>>2]=b;if(!b){c[1829]=c[1829]&~(1<<j);break}}else{if(a>>>0<(c[1832]|0)>>>0)ka();j=a+16|0;if((c[j>>2]|0)==(m|0))c[j>>2]=b;else c[a+20>>2]=b;if(!b)break}h=c[1832]|0;if(b>>>0<h>>>0)ka();c[b+24>>2]=a;j=c[m+16>>2]|0;do if(j)if(j>>>0<h>>>0)ka();else{c[b+16>>2]=j;c[j+24>>2]=b;break}while(0);j=c[m+20>>2]|0;if(j)if(j>>>0<(c[1832]|0)>>>0)ka();else{c[b+20>>2]=j;c[j+24>>2]=b;break}}while(0);b:do if(n>>>0>=16){c[m+4>>2]=p|3;c[m+(p|4)>>2]=n|1;c[m+(n+p)>>2]=n;j=n>>>3;if(n>>>0<256){g=j<<1;d=7352+(g<<2)|0;h=c[1828]|0;j=1<<j;do if(!(h&j)){c[1828]=h|j;t=7352+(g+2<<2)|0;u=d}else{f=7352+(g+2<<2)|0;e=c[f>>2]|0;if(e>>>0>=(c[1832]|0)>>>0){t=f;u=e;break}ka()}while(0);c[t>>2]=o;c[u+12>>2]=o;c[m+(p+8)>>2]=u;c[m+(p+12)>>2]=d;break}d=n>>>8;if(d)if(n>>>0>16777215)f=31;else{w=(d+1048320|0)>>>16&8;x=d<<w;u=(x+520192|0)>>>16&4;x=x<<u;f=(x+245760|0)>>>16&2;f=14-(u|w|f)+(x<<f>>>15)|0;f=n>>>(f+7|0)&1|f<<1}else f=0;h=7616+(f<<2)|0;c[m+(p+28)>>2]=f;c[m+(p+20)>>2]=0;c[m+(p+16)>>2]=0;j=c[1829]|0;g=1<<f;if(!(j&g)){c[1829]=j|g;c[h>>2]=o;c[m+(p+24)>>2]=h;c[m+(p+12)>>2]=o;c[m+(p+8)>>2]=o;break}j=c[h>>2]|0;if((f|0)==31)d=0;else d=25-(f>>>1)|0;c:do if((c[j+4>>2]&-8|0)!=(n|0)){f=n<<d;while(1){g=j+(f>>>31<<2)+16|0;h=c[g>>2]|0;if(!h)break;if((c[h+4>>2]&-8|0)==(n|0)){v=h;break c}else{f=f<<1;j=h}}if(g>>>0<(c[1832]|0)>>>0)ka();else{c[g>>2]=o;c[m+(p+24)>>2]=j;c[m+(p+12)>>2]=o;c[m+(p+8)>>2]=o;break b}}else v=j;while(0);b=v+8|0;d=c[b>>2]|0;x=c[1832]|0;if(v>>>0>=x>>>0&d>>>0>=x>>>0){c[d+12>>2]=o;c[b>>2]=o;c[m+(p+8)>>2]=d;c[m+(p+12)>>2]=v;c[m+(p+24)>>2]=0;break}else ka()}else{x=n+p|0;c[m+4>>2]=x|3;x=m+(x+4)|0;c[x>>2]=c[x>>2]|1}while(0);x=m+8|0;i=L;return x|0}}}else p=-1;while(0);k=c[1830]|0;if(k>>>0>=p>>>0){d=k-p|0;b=c[1833]|0;if(d>>>0>15){c[1833]=b+p;c[1830]=d;c[b+(p+4)>>2]=d|1;c[b+k>>2]=d;c[b+4>>2]=p|3}else{c[1830]=0;c[1833]=0;c[b+4>>2]=k|3;x=b+(k+4)|0;c[x>>2]=c[x>>2]|1}x=b+8|0;i=L;return x|0}k=c[1831]|0;if(k>>>0>p>>>0){w=k-p|0;c[1831]=w;x=c[1834]|0;c[1834]=x+p;c[x+(p+4)>>2]=w|1;c[x+4>>2]=p|3;x=x+8|0;i=L;return x|0}do if(!(c[1946]|0)){k=ua(30)|0;if(!(k+-1&k)){c[1948]=k;c[1947]=k;c[1949]=-1;c[1950]=-1;c[1951]=0;c[1939]=0;c[1946]=(ta(0)|0)&-16^1431655768;break}else ka()}while(0);l=p+48|0;g=c[1948]|0;f=p+47|0;h=g+f|0;g=0-g|0;m=h&g;if(m>>>0<=p>>>0){x=0;i=L;return x|0}a=c[1938]|0;if((a|0)!=0?(u=c[1936]|0,v=u+m|0,v>>>0<=u>>>0|v>>>0>a>>>0):0){x=0;i=L;return x|0}d:do if(!(c[1939]&4)){j=c[1834]|0;e:do if(j){a=7760|0;while(1){k=c[a>>2]|0;if(k>>>0<=j>>>0?(s=a+4|0,(k+(c[s>>2]|0)|0)>>>0>j>>>0):0)break;a=c[a+8>>2]|0;if(!a){A=181;break e}}if(a){k=h-(c[1831]|0)&g;if(k>>>0<2147483647){j=ma(k|0)|0;if((j|0)==((c[a>>2]|0)+(c[s>>2]|0)|0))A=190;else A=191}else k=0}else A=181}else A=181;while(0);do if((A|0)==181){j=ma(0)|0;if((j|0)!=(-1|0)){a=j;k=c[1947]|0;h=k+-1|0;if(!(h&a))k=m;else k=m-a+(h+a&0-k)|0;a=c[1936]|0;h=a+k|0;if(k>>>0>p>>>0&k>>>0<2147483647){v=c[1938]|0;if((v|0)!=0?h>>>0<=a>>>0|h>>>0>v>>>0:0){k=0;break}h=ma(k|0)|0;if((h|0)==(j|0))A=190;else{j=h;A=191}}else k=0}else k=0}while(0);f:do if((A|0)==190){if((j|0)!=(-1|0)){w=j;s=k;A=201;break d}}else if((A|0)==191){a=0-k|0;do if((j|0)!=(-1|0)&k>>>0<2147483647&l>>>0>k>>>0?(d=c[1948]|0,d=f-k+d&0-d,d>>>0<2147483647):0)if((ma(d|0)|0)==(-1|0)){ma(a|0)|0;k=0;break f}else{k=d+k|0;break}while(0);if((j|0)==(-1|0))k=0;else{w=j;s=k;A=201;break d}}while(0);c[1939]=c[1939]|4;A=198}else{k=0;A=198}while(0);if((((A|0)==198?m>>>0<2147483647:0)?(w=ma(m|0)|0,x=ma(0)|0,(w|0)!=(-1|0)&(x|0)!=(-1|0)&w>>>0<x>>>0):0)?(z=x-w|0,y=z>>>0>(p+40|0)>>>0,y):0){s=y?z:k;A=201}if((A|0)==201){j=(c[1936]|0)+s|0;c[1936]=j;if(j>>>0>(c[1937]|0)>>>0)c[1937]=j;o=c[1834]|0;g:do if(o){f=7760|0;while(1){k=c[f>>2]|0;g=f+4|0;j=c[g>>2]|0;if((w|0)==(k+j|0)){A=213;break}h=c[f+8>>2]|0;if(!h)break;else f=h}if(((A|0)==213?(c[f+12>>2]&8|0)==0:0)?o>>>0>=k>>>0&o>>>0<w>>>0:0){c[g>>2]=j+s;d=(c[1831]|0)+s|0;b=o+8|0;if(!(b&7))b=0;else b=0-b&7;x=d-b|0;c[1834]=o+b;c[1831]=x;c[o+(b+4)>>2]=x|1;c[o+(d+4)>>2]=40;c[1835]=c[1950];break}k=c[1832]|0;if(w>>>0<k>>>0){c[1832]=w;k=w}h=w+s|0;g=7760|0;while(1){if((c[g>>2]|0)==(h|0)){A=223;break}j=c[g+8>>2]|0;if(!j)break;else g=j}if((A|0)==223?(c[g+12>>2]&8|0)==0:0){c[g>>2]=w;j=g+4|0;c[j>>2]=(c[j>>2]|0)+s;j=w+8|0;if(!(j&7))r=0;else r=0-j&7;j=w+(s+8)|0;if(!(j&7))b=0;else b=0-j&7;j=w+(b+s)|0;q=r+p|0;n=w+q|0;d=j-(w+r)-p|0;c[w+(r+4)>>2]=p|3;h:do if((j|0)!=(o|0)){if((j|0)==(c[1833]|0)){x=(c[1830]|0)+d|0;c[1830]=x;c[1833]=n;c[w+(q+4)>>2]=x|1;c[w+(x+q)>>2]=x;break}l=s+4|0;h=c[w+(l+b)>>2]|0;if((h&3|0)==1){m=h&-8;e=h>>>3;i:do if(h>>>0>=256){a=c[w+((b|24)+s)>>2]|0;g=c[w+(s+12+b)>>2]|0;do if((g|0)==(j|0)){g=b|16;f=w+(l+g)|0;h=c[f>>2]|0;if(!h){g=w+(g+s)|0;h=c[g>>2]|0;if(!h){H=0;break}}else g=f;while(1){e=h+20|0;f=c[e>>2]|0;if(f){h=f;g=e;continue}e=h+16|0;f=c[e>>2]|0;if(!f)break;else{h=f;g=e}}if(g>>>0<k>>>0)ka();else{c[g>>2]=0;H=h;break}}else{f=c[w+((b|8)+s)>>2]|0;if(f>>>0<k>>>0)ka();k=f+12|0;if((c[k>>2]|0)!=(j|0))ka();h=g+8|0;if((c[h>>2]|0)==(j|0)){c[k>>2]=g;c[h>>2]=f;H=g;break}else ka()}while(0);if(!a)break;k=c[w+(s+28+b)>>2]|0;h=7616+(k<<2)|0;do if((j|0)!=(c[h>>2]|0)){if(a>>>0<(c[1832]|0)>>>0)ka();k=a+16|0;if((c[k>>2]|0)==(j|0))c[k>>2]=H;else c[a+20>>2]=H;if(!H)break i}else{c[h>>2]=H;if(H)break;c[1829]=c[1829]&~(1<<k);break i}while(0);h=c[1832]|0;if(H>>>0<h>>>0)ka();c[H+24>>2]=a;j=b|16;k=c[w+(j+s)>>2]|0;do if(k)if(k>>>0<h>>>0)ka();else{c[H+16>>2]=k;c[k+24>>2]=H;break}while(0);j=c[w+(l+j)>>2]|0;if(!j)break;if(j>>>0<(c[1832]|0)>>>0)ka();else{c[H+20>>2]=j;c[j+24>>2]=H;break}}else{g=c[w+((b|8)+s)>>2]|0;f=c[w+(s+12+b)>>2]|0;h=7352+(e<<1<<2)|0;do if((g|0)!=(h|0)){if(g>>>0<k>>>0)ka();if((c[g+12>>2]|0)==(j|0))break;ka()}while(0);if((f|0)==(g|0)){c[1828]=c[1828]&~(1<<e);break}do if((f|0)==(h|0))D=f+8|0;else{if(f>>>0<k>>>0)ka();k=f+8|0;if((c[k>>2]|0)==(j|0)){D=k;break}ka()}while(0);c[g+12>>2]=f;c[D>>2]=g}while(0);j=w+((m|b)+s)|0;k=m+d|0}else k=d;j=j+4|0;c[j>>2]=c[j>>2]&-2;c[w+(q+4)>>2]=k|1;c[w+(k+q)>>2]=k;j=k>>>3;if(k>>>0<256){g=j<<1;f=7352+(g<<2)|0;h=c[1828]|0;j=1<<j;do if(!(h&j)){c[1828]=h|j;I=7352+(g+2<<2)|0;J=f}else{j=7352+(g+2<<2)|0;h=c[j>>2]|0;if(h>>>0>=(c[1832]|0)>>>0){I=j;J=h;break}ka()}while(0);c[I>>2]=n;c[J+12>>2]=n;c[w+(q+8)>>2]=J;c[w+(q+12)>>2]=f;break}d=k>>>8;do if(!d)f=0;else{if(k>>>0>16777215){f=31;break}v=(d+1048320|0)>>>16&8;x=d<<v;u=(x+520192|0)>>>16&4;x=x<<u;f=(x+245760|0)>>>16&2;f=14-(u|v|f)+(x<<f>>>15)|0;f=k>>>(f+7|0)&1|f<<1}while(0);h=7616+(f<<2)|0;c[w+(q+28)>>2]=f;c[w+(q+20)>>2]=0;c[w+(q+16)>>2]=0;j=c[1829]|0;g=1<<f;if(!(j&g)){c[1829]=j|g;c[h>>2]=n;c[w+(q+24)>>2]=h;c[w+(q+12)>>2]=n;c[w+(q+8)>>2]=n;break}j=c[h>>2]|0;if((f|0)==31)h=0;else h=25-(f>>>1)|0;j:do if((c[j+4>>2]&-8|0)!=(k|0)){f=k<<h;while(1){g=j+(f>>>31<<2)+16|0;h=c[g>>2]|0;if(!h)break;if((c[h+4>>2]&-8|0)==(k|0)){K=h;break j}else{f=f<<1;j=h}}if(g>>>0<(c[1832]|0)>>>0)ka();else{c[g>>2]=n;c[w+(q+24)>>2]=j;c[w+(q+12)>>2]=n;c[w+(q+8)>>2]=n;break h}}else K=j;while(0);b=K+8|0;d=c[b>>2]|0;x=c[1832]|0;if(K>>>0>=x>>>0&d>>>0>=x>>>0){c[d+12>>2]=n;c[b>>2]=n;c[w+(q+8)>>2]=d;c[w+(q+12)>>2]=K;c[w+(q+24)>>2]=0;break}else ka()}else{x=(c[1831]|0)+d|0;c[1831]=x;c[1834]=n;c[w+(q+4)>>2]=x|1}while(0);x=w+(r|8)|0;i=L;return x|0}j=7760|0;while(1){h=c[j>>2]|0;if(h>>>0<=o>>>0?(B=c[j+4>>2]|0,C=h+B|0,C>>>0>o>>>0):0)break;j=c[j+8>>2]|0}j=h+(B+-39)|0;if(!(j&7))j=0;else j=0-j&7;g=h+(B+-47+j)|0;g=g>>>0<(o+16|0)>>>0?o:g;h=g+8|0;j=w+8|0;if(!(j&7))j=0;else j=0-j&7;f=s+-40-j|0;c[1834]=w+j;c[1831]=f;c[w+(j+4)>>2]=f|1;c[w+(s+-36)>>2]=40;c[1835]=c[1950];c[g+4>>2]=27;c[h+0>>2]=c[1940];c[h+4>>2]=c[1941];c[h+8>>2]=c[1942];c[h+12>>2]=c[1943];c[1940]=w;c[1941]=s;c[1943]=0;c[1942]=h;f=g+28|0;c[f>>2]=7;if((g+32|0)>>>0<C>>>0)do{x=f;f=f+4|0;c[f>>2]=7}while((x+8|0)>>>0<C>>>0);if((g|0)!=(o|0)){k=g-o|0;j=o+(k+4)|0;c[j>>2]=c[j>>2]&-2;c[o+4>>2]=k|1;c[o+k>>2]=k;j=k>>>3;if(k>>>0<256){g=j<<1;f=7352+(g<<2)|0;h=c[1828]|0;j=1<<j;do if(!(h&j)){c[1828]=h|j;E=7352+(g+2<<2)|0;F=f}else{d=7352+(g+2<<2)|0;b=c[d>>2]|0;if(b>>>0>=(c[1832]|0)>>>0){E=d;F=b;break}ka()}while(0);c[E>>2]=o;c[F+12>>2]=o;c[o+8>>2]=F;c[o+12>>2]=f;break}d=k>>>8;if(d)if(k>>>0>16777215)g=31;else{w=(d+1048320|0)>>>16&8;x=d<<w;v=(x+520192|0)>>>16&4;x=x<<v;g=(x+245760|0)>>>16&2;g=14-(v|w|g)+(x<<g>>>15)|0;g=k>>>(g+7|0)&1|g<<1}else g=0;h=7616+(g<<2)|0;c[o+28>>2]=g;c[o+20>>2]=0;c[o+16>>2]=0;e=c[1829]|0;j=1<<g;if(!(e&j)){c[1829]=e|j;c[h>>2]=o;c[o+24>>2]=h;c[o+12>>2]=o;c[o+8>>2]=o;break}e=c[h>>2]|0;if((g|0)==31)d=0;else d=25-(g>>>1)|0;k:do if((c[e+4>>2]&-8|0)!=(k|0)){j=k<<d;while(1){h=e+(j>>>31<<2)+16|0;d=c[h>>2]|0;if(!d)break;if((c[d+4>>2]&-8|0)==(k|0)){G=d;break k}else{j=j<<1;e=d}}if(h>>>0<(c[1832]|0)>>>0)ka();else{c[h>>2]=o;c[o+24>>2]=e;c[o+12>>2]=o;c[o+8>>2]=o;break g}}else G=e;while(0);b=G+8|0;d=c[b>>2]|0;x=c[1832]|0;if(G>>>0>=x>>>0&d>>>0>=x>>>0){c[d+12>>2]=o;c[b>>2]=o;c[o+8>>2]=d;c[o+12>>2]=G;c[o+24>>2]=0;break}else ka()}}else{x=c[1832]|0;if((x|0)==0|w>>>0<x>>>0)c[1832]=w;c[1940]=w;c[1941]=s;c[1943]=0;c[1837]=c[1946];c[1836]=-1;b=0;do{x=b<<1;v=7352+(x<<2)|0;c[7352+(x+3<<2)>>2]=v;c[7352+(x+2<<2)>>2]=v;b=b+1|0}while((b|0)!=32);b=w+8|0;if(!(b&7))b=0;else b=0-b&7;x=s+-40-b|0;c[1834]=w+b;c[1831]=x;c[w+(b+4)>>2]=x|1;c[w+(s+-36)>>2]=40;c[1835]=c[1950]}while(0);b=c[1831]|0;if(b>>>0>p>>>0){w=b-p|0;c[1831]=w;x=c[1834]|0;c[1834]=x+p;c[x+(p+4)>>2]=w|1;c[x+4>>2]=p|3;x=x+8|0;i=L;return x|0}}c[(va()|0)>>2]=12;x=0;i=L;return x|0}function kd(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0;w=i;if(!a){i=w;return}f=a+-8|0;h=c[1832]|0;if(f>>>0<h>>>0)ka();g=c[a+-4>>2]|0;e=g&3;if((e|0)==1)ka();q=g&-8;r=a+(q+-8)|0;do if(!(g&1)){g=c[f>>2]|0;if(!e){i=w;return}j=-8-g|0;m=a+j|0;n=g+q|0;if(m>>>0<h>>>0)ka();if((m|0)==(c[1833]|0)){f=a+(q+-4)|0;g=c[f>>2]|0;if((g&3|0)!=3){v=m;l=n;break}c[1830]=n;c[f>>2]=g&-2;c[a+(j+4)>>2]=n|1;c[r>>2]=n;i=w;return}d=g>>>3;if(g>>>0<256){e=c[a+(j+8)>>2]|0;f=c[a+(j+12)>>2]|0;g=7352+(d<<1<<2)|0;if((e|0)!=(g|0)){if(e>>>0<h>>>0)ka();if((c[e+12>>2]|0)!=(m|0))ka()}if((f|0)==(e|0)){c[1828]=c[1828]&~(1<<d);v=m;l=n;break}if((f|0)!=(g|0)){if(f>>>0<h>>>0)ka();g=f+8|0;if((c[g>>2]|0)==(m|0))b=g;else ka()}else b=f+8|0;c[e+12>>2]=f;c[b>>2]=e;v=m;l=n;break}b=c[a+(j+24)>>2]|0;e=c[a+(j+12)>>2]|0;do if((e|0)==(m|0)){f=a+(j+20)|0;g=c[f>>2]|0;if(!g){f=a+(j+16)|0;g=c[f>>2]|0;if(!g){k=0;break}}while(1){d=g+20|0;e=c[d>>2]|0;if(e){g=e;f=d;continue}d=g+16|0;e=c[d>>2]|0;if(!e)break;else{g=e;f=d}}if(f>>>0<h>>>0)ka();else{c[f>>2]=0;k=g;break}}else{d=c[a+(j+8)>>2]|0;if(d>>>0<h>>>0)ka();g=d+12|0;if((c[g>>2]|0)!=(m|0))ka();f=e+8|0;if((c[f>>2]|0)==(m|0)){c[g>>2]=e;c[f>>2]=d;k=e;break}else ka()}while(0);if(b){g=c[a+(j+28)>>2]|0;f=7616+(g<<2)|0;if((m|0)==(c[f>>2]|0)){c[f>>2]=k;if(!k){c[1829]=c[1829]&~(1<<g);v=m;l=n;break}}else{if(b>>>0<(c[1832]|0)>>>0)ka();g=b+16|0;if((c[g>>2]|0)==(m|0))c[g>>2]=k;else c[b+20>>2]=k;if(!k){v=m;l=n;break}}f=c[1832]|0;if(k>>>0<f>>>0)ka();c[k+24>>2]=b;g=c[a+(j+16)>>2]|0;do if(g)if(g>>>0<f>>>0)ka();else{c[k+16>>2]=g;c[g+24>>2]=k;break}while(0);g=c[a+(j+20)>>2]|0;if(g)if(g>>>0<(c[1832]|0)>>>0)ka();else{c[k+20>>2]=g;c[g+24>>2]=k;v=m;l=n;break}else{v=m;l=n}}else{v=m;l=n}}else{v=f;l=q}while(0);if(v>>>0>=r>>>0)ka();g=a+(q+-4)|0;f=c[g>>2]|0;if(!(f&1))ka();if(!(f&2)){if((r|0)==(c[1834]|0)){m=(c[1831]|0)+l|0;c[1831]=m;c[1834]=v;c[v+4>>2]=m|1;if((v|0)!=(c[1833]|0)){i=w;return}c[1833]=0;c[1830]=0;i=w;return}if((r|0)==(c[1833]|0)){m=(c[1830]|0)+l|0;c[1830]=m;c[1833]=v;c[v+4>>2]=m|1;c[v+m>>2]=m;i=w;return}h=(f&-8)+l|0;d=f>>>3;do if(f>>>0>=256){b=c[a+(q+16)>>2]|0;g=c[a+(q|4)>>2]|0;do if((g|0)==(r|0)){f=a+(q+12)|0;g=c[f>>2]|0;if(!g){f=a+(q+8)|0;g=c[f>>2]|0;if(!g){p=0;break}}while(1){d=g+20|0;e=c[d>>2]|0;if(e){g=e;f=d;continue}d=g+16|0;e=c[d>>2]|0;if(!e)break;else{g=e;f=d}}if(f>>>0<(c[1832]|0)>>>0)ka();else{c[f>>2]=0;p=g;break}}else{f=c[a+q>>2]|0;if(f>>>0<(c[1832]|0)>>>0)ka();e=f+12|0;if((c[e>>2]|0)!=(r|0))ka();d=g+8|0;if((c[d>>2]|0)==(r|0)){c[e>>2]=g;c[d>>2]=f;p=g;break}else ka()}while(0);if(b){g=c[a+(q+20)>>2]|0;f=7616+(g<<2)|0;if((r|0)==(c[f>>2]|0)){c[f>>2]=p;if(!p){c[1829]=c[1829]&~(1<<g);break}}else{if(b>>>0<(c[1832]|0)>>>0)ka();g=b+16|0;if((c[g>>2]|0)==(r|0))c[g>>2]=p;else c[b+20>>2]=p;if(!p)break}g=c[1832]|0;if(p>>>0<g>>>0)ka();c[p+24>>2]=b;f=c[a+(q+8)>>2]|0;do if(f)if(f>>>0<g>>>0)ka();else{c[p+16>>2]=f;c[f+24>>2]=p;break}while(0);d=c[a+(q+12)>>2]|0;if(d)if(d>>>0<(c[1832]|0)>>>0)ka();else{c[p+20>>2]=d;c[d+24>>2]=p;break}}}else{e=c[a+q>>2]|0;f=c[a+(q|4)>>2]|0;g=7352+(d<<1<<2)|0;if((e|0)!=(g|0)){if(e>>>0<(c[1832]|0)>>>0)ka();if((c[e+12>>2]|0)!=(r|0))ka()}if((f|0)==(e|0)){c[1828]=c[1828]&~(1<<d);break}if((f|0)!=(g|0)){if(f>>>0<(c[1832]|0)>>>0)ka();g=f+8|0;if((c[g>>2]|0)==(r|0))o=g;else ka()}else o=f+8|0;c[e+12>>2]=f;c[o>>2]=e}while(0);c[v+4>>2]=h|1;c[v+h>>2]=h;if((v|0)==(c[1833]|0)){c[1830]=h;i=w;return}else g=h}else{c[g>>2]=f&-2;c[v+4>>2]=l|1;c[v+l>>2]=l;g=l}e=g>>>3;if(g>>>0<256){f=e<<1;g=7352+(f<<2)|0;d=c[1828]|0;e=1<<e;if(d&e){d=7352+(f+2<<2)|0;b=c[d>>2]|0;if(b>>>0<(c[1832]|0)>>>0)ka();else{s=d;t=b}}else{c[1828]=d|e;s=7352+(f+2<<2)|0;t=g}c[s>>2]=v;c[t+12>>2]=v;c[v+8>>2]=t;c[v+12>>2]=g;i=w;return}d=g>>>8;if(d)if(g>>>0>16777215)f=31;else{l=(d+1048320|0)>>>16&8;m=d<<l;k=(m+520192|0)>>>16&4;m=m<<k;f=(m+245760|0)>>>16&2;f=14-(k|l|f)+(m<<f>>>15)|0;f=g>>>(f+7|0)&1|f<<1}else f=0;b=7616+(f<<2)|0;c[v+28>>2]=f;c[v+20>>2]=0;c[v+16>>2]=0;d=c[1829]|0;e=1<<f;a:do if(d&e){b=c[b>>2]|0;if((f|0)==31)d=0;else d=25-(f>>>1)|0;b:do if((c[b+4>>2]&-8|0)!=(g|0)){f=g<<d;while(1){e=b+(f>>>31<<2)+16|0;d=c[e>>2]|0;if(!d)break;if((c[d+4>>2]&-8|0)==(g|0)){u=d;break b}else{f=f<<1;b=d}}if(e>>>0<(c[1832]|0)>>>0)ka();else{c[e>>2]=v;c[v+24>>2]=b;c[v+12>>2]=v;c[v+8>>2]=v;break a}}else u=b;while(0);d=u+8|0;b=c[d>>2]|0;m=c[1832]|0;if(u>>>0>=m>>>0&b>>>0>=m>>>0){c[b+12>>2]=v;c[d>>2]=v;c[v+8>>2]=b;c[v+12>>2]=u;c[v+24>>2]=0;break}else ka()}else{c[1829]=d|e;c[b>>2]=v;c[v+24>>2]=b;c[v+12>>2]=v;c[v+8>>2]=v}while(0);m=(c[1836]|0)+-1|0;c[1836]=m;if(!m)b=7768|0;else{i=w;return}while(1){b=c[b>>2]|0;if(!b)break;else b=b+8|0}c[1836]=-1;i=w;return}function ld(){}function md(b){b=b|0;var c=0;c=b;while(a[c>>0]|0)c=c+1|0;return c-b|0}function nd(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0;f=b+e|0;if((e|0)>=20){d=d&255;h=b&3;i=d|d<<8|d<<16|d<<24;g=f&~3;if(h){h=b+4-h|0;while((b|0)<(h|0)){a[b>>0]=d;b=b+1|0}}while((b|0)<(g|0)){c[b>>2]=i;b=b+4|0}}while((b|0)<(f|0)){a[b>>0]=d;b=b+1|0}return b-e|0}function od(b,d,e){b=b|0;d=d|0;e=e|0;var f=0;if((e|0)>=4096)return pa(b|0,d|0,e|0)|0;f=b|0;if((b&3)==(d&3)){while(b&3){if(!e)return f|0;a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0;e=e-1|0}while((e|0)>=4){c[b>>2]=c[d>>2];b=b+4|0;d=d+4|0;e=e-4|0}}while((e|0)>0){a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0;e=e-1|0}return f|0}function pd(a,b,c,d,e,f){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;f=f|0;xa[a&3](b|0,c|0,d|0,e|0,f|0)}function qd(a,b,c,d,e){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;_(0)}

// EMSCRIPTEN_END_FUNCS
var xa=[qd,fc,ec,qd];return{_strlen:md,_free:kd,_broadwayGetMajorVersion:dd,_get_h264bsdClip:Lb,_broadwayExit:cd,_memset:nd,_broadwayCreateStream:Zc,_malloc:jd,_memcpy:od,_broadwayGetMinorVersion:ed,_broadwayPlayStream:$c,_broadwaySetStreamLength:_c,_broadwayInit:ad,runPostSets:ld,stackAlloc:ya,stackSave:za,stackRestore:Aa,setThrew:Ba,setTempRet0:Ea,getTempRet0:Fa,dynCall_viiiii:pd}})


// EMSCRIPTEN_END_ASM
(p.Xc,p.Yc,Q),Bb=p._strlen=$._strlen,Ea=p._free=$._free;p._broadwayGetMajorVersion=$._broadwayGetMajorVersion;p._get_h264bsdClip=$._get_h264bsdClip;p._broadwayExit=$._broadwayExit;var Gb=p._memset=$._memset;p._broadwayCreateStream=$._broadwayCreateStream;var Ca=p._malloc=$._malloc,gc=p._memcpy=$._memcpy;
p._broadwayGetMinorVersion=$._broadwayGetMinorVersion;p._broadwayPlayStream=$._broadwayPlayStream;p._broadwaySetStreamLength=$._broadwaySetStreamLength;p._broadwayInit=$._broadwayInit;p.runPostSets=$.runPostSets;p.dynCall_viiiii=$.dynCall_viiiii;z.pb=$.stackAlloc;z.Tb=$.stackSave;z.Sb=$.stackRestore;z.Yd=$.setTempRet0;z.xd=$.getTempRet0;
if(T)if("function"===typeof p.locateFile?T=p.locateFile(T):p.memoryInitializerPrefixURL&&(T=p.memoryInitializerPrefixURL+T),t||da){var hc=p.readBinary(T);N.set(hc,Ia)}else Ya(),yb(T,function(a){N.set(a,Ia);Za()},function(){d("could not load memory initializer "+T)});function ia(a){this.name="ExitStatus";this.message="Program terminated with exit("+a+")";this.status=a}ia.prototype=Error();var ic,jc=k,Xa=function kc(){!p.calledRun&&lc&&mc();p.calledRun||(Xa=kc)};
p.callMain=p.ag=function(a){function b(){for(var a=0;3>a;a++)e.push(0)}w(0==S,"cannot call main when async dependencies remain! (listen on __ATMAIN__)");w(0==Oa.length,"cannot call main when preRun functions remain to be called");a=a||[];Sa||(Sa=i,Na(R));var c=a.length+1,e=[M(Va(p.thisProgram),"i8",0)];b();for(var f=0;f<c-1;f+=1)e.push(M(Va(a[f]),"i8",0)),b();e.push(0);e=M(e,"i32",0);ic=y;try{var h=p._main(c,e,0);nc(h)}catch(j){j instanceof ia||("SimulateInfiniteLoop"==j?p.noExitRuntime=i:(j&&("object"===
typeof j&&j.stack)&&p.fa("exception thrown: "+[j,j.stack]),d(j)))}finally{}};
function mc(a){function b(){if(!p.calledRun&&(p.calledRun=i,!H)){Sa||(Sa=i,Na(R));Na(Pa);ba&&jc!==k&&p.fa("pre-main prep time: "+(Date.now()-jc)+" ms");if(p.onRuntimeInitialized)p.onRuntimeInitialized();p._main&&lc&&p.callMain(a);if(p.postRun)for("function"==typeof p.postRun&&(p.postRun=[p.postRun]);p.postRun.length;)Ua(p.postRun.shift());Na(Ra)}}a=a||p.arguments;jc===k&&(jc=Date.now());if(!(0<S)){if(p.preRun)for("function"==typeof p.preRun&&(p.preRun=[p.preRun]);p.preRun.length;)Ta(p.preRun.shift());
Na(Oa);!(0<S)&&!p.calledRun&&(p.setStatus?(p.setStatus("Running..."),setTimeout(function(){setTimeout(function(){p.setStatus("")},1);b()},1)):b())}}p.run=p.Ng=mc;function nc(a){p.noExitRuntime||(H=i,y=ic,Na(Qa),t?(process.stdout.once("drain",function(){process.exit(a)}),console.log(" "),setTimeout(function(){process.exit(a)},500)):da&&"function"===typeof quit&&quit(a),d(new ia(a)))}p.exit=p.hg=nc;
function A(a){a&&(p.print(a),p.fa(a));H=i;d("abort() at "+Fa()+"\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.")}p.abort=p.abort=A;if(p.preInit)for("function"==typeof p.preInit&&(p.preInit=[p.preInit]);0<p.preInit.length;)p.preInit.pop()();var lc=m;p.noInitialRun&&(lc=m);mc();

    var resultModule = window.Module || global.Module || Module;
    
    return resultModule;
  };
  
  
  var nowValue = function(){
    return (new Date()).getTime();
  };
  
  if (typeof performance != "undefined"){
    if (performance.now){
      nowValue = function(){
        return performance.now();
      };
    };
  };
  
  
  var Broadway = function(parOptions){
    this.options = parOptions || {};
    
    this.now = nowValue;
    
    var asmInstance;
    
    var fakeWindow = {
    };
    
    var Module = getModule.apply(fakeWindow, [function () {

    }, function ($buffer, width, height) {
      var buffer = this.pictureBuffers[$buffer];
      if (!buffer) {
        buffer = this.pictureBuffers[$buffer] = toU8Array($buffer, (width * height * 3) / 2);
      };
      
      var infos;
      var doInfo = false;
      if (this.infoAr.length){
        doInfo = true;
        infos = this.infoAr;
      };
      this.infoAr = [];
      
      if (this.options.rgb){
        if (!asmInstance){
          asmInstance = getAsm(width, height);
        };
        asmInstance.inp.set(buffer);
        asmInstance.doit();

        var copyU8 = new Uint8Array(asmInstance.outSize);
        copyU8.set( asmInstance.out );
        
        if (doInfo){
          infos[0].finishDecoding = nowValue();
        };
        
        this.onPictureDecoded(copyU8, width, height, infos);
        return;
        
      };
      
      if (doInfo){
        infos[0].finishDecoding = nowValue();
      };
      this.onPictureDecoded(buffer, width, height, infos);
    }.bind(this)]);

    var HEAP8 = Module.HEAP8;
    var HEAPU8 = Module.HEAPU8;
    var HEAP16 = Module.HEAP16;
    var HEAP32 = Module.HEAP32;
    var _h264bsdClip = Module._get_h264bsdClip();

    
    var MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
  
    // from old constructor
    Module._broadwayInit();
    
    /**
   * Creates a typed array from a HEAP8 pointer. 
   */
    function toU8Array(ptr, length) {
      return HEAPU8.subarray(ptr, ptr + length);
    };
    this.streamBuffer = toU8Array(Module._broadwayCreateStream(MAX_STREAM_BUFFER_LENGTH), MAX_STREAM_BUFFER_LENGTH);
    this.pictureBuffers = {};
    // collect extra infos that are provided with the nal units
    this.infoAr = [];
    
    this.onPictureDecoded = function (buffer, width, height, infos) {
      
    };
    
    /**
     * Decodes a stream buffer. This may be one single (unframed) NAL unit without the
     * start code, or a sequence of NAL units with framing start code prefixes. This
     * function overwrites stream buffer allocated by the codec with the supplied buffer.
     */
    this.decode = function decode(buffer, parInfo) {
      // console.info("Decoding: " + buffer.length);
      // collect infos
      if (parInfo){
        this.infoAr.push(parInfo);
        parInfo.startDecoding = nowValue();
      };
      
      this.streamBuffer.set(buffer);
      Module._broadwaySetStreamLength(buffer.length);
      Module._broadwayPlayStream();
    };


    
    function patchOptimizations(config, patches) { 
      var scope = getGlobalScope();
      for (var name in patches) {
        var patch = patches[name];
        if (patch) {
          var option = config[name];
          if (!option) option = "original";
          console.info(name + ": " + option);
          assert (option in patch.options);
          var fn = patch.options[option].fn;
          if (fn) {
            scope[patch.original] = Module.patch(null, patch.name, fn);
            console.info("Patching: " + patch.name + ", with: " + option);
          }
        }
      }
    };
    
    var patches = {
      "filter": {
        name: "_h264bsdFilterPicture",
        display: "Filter Picture",
        original: "Original_h264bsdFilterPicture",
        options: {
          none: {display: "None", fn: function () {}},
          original: {display: "Original", fn: null},
        }
      },
      "filterHorLuma": {
        name: "_FilterHorLuma",
        display: "Filter Hor Luma",
        original: "OriginalFilterHorLuma",
        options: {
          none: {display: "None", fn: function () {}},
          original: {display: "Original", fn: null},
          optimized: {display: "Optimized", fn: OptimizedFilterHorLuma}
        }
      },
      "filterVerLumaEdge": {
        name: "_FilterVerLumaEdge",
        display: "Filter Ver Luma Edge",
        original: "OriginalFilterVerLumaEdge",
        options: {
          none: {display: "None", fn: function () {}},
          original: {display: "Original", fn: null},
          optimized: {display: "Optimized", fn: OptimizedFilterVerLumaEdge}
        }
      },
      "getBoundaryStrengthsA": {
        name: "_GetBoundaryStrengthsA",
        display: "Get Boundary Strengths",
        original: "OriginalGetBoundaryStrengthsA",
        options: {
          none: {display: "None", fn: function () {}},
          original: {display: "Original", fn: null},
          optimized: {display: "Optimized", fn: OptimizedGetBoundaryStrengthsA}
        }
      }
    };
    function getGlobalScope() {
      return function () { return this; }.call(null);
    };
    
    /* Optimizations */

    function clip(x, y, z) {
      return z < x ? x : (z > y ? y : z);
    }

    function OptimizedGetBoundaryStrengthsA($mb, $bS) {
      var $totalCoeff = $mb + 28;

      var tc0 = HEAP16[$totalCoeff + 0 >> 1];
      var tc1 = HEAP16[$totalCoeff + 2 >> 1];
      var tc2 = HEAP16[$totalCoeff + 4 >> 1];
      var tc3 = HEAP16[$totalCoeff + 6 >> 1];
      var tc4 = HEAP16[$totalCoeff + 8 >> 1];
      var tc5 = HEAP16[$totalCoeff + 10 >> 1];
      var tc6 = HEAP16[$totalCoeff + 12 >> 1];
      var tc7 = HEAP16[$totalCoeff + 14 >> 1];
      var tc8 = HEAP16[$totalCoeff + 16 >> 1];
      var tc9 = HEAP16[$totalCoeff + 18 >> 1];
      var tc10 = HEAP16[$totalCoeff + 20 >> 1];
      var tc11 = HEAP16[$totalCoeff + 22 >> 1];
      var tc12 = HEAP16[$totalCoeff + 24 >> 1];
      var tc13 = HEAP16[$totalCoeff + 26 >> 1];
      var tc14 = HEAP16[$totalCoeff + 28 >> 1];
      var tc15 = HEAP16[$totalCoeff + 30 >> 1];

      HEAP32[$bS + 32 >> 2] = tc2 || tc0 ? 2 : 0;
      HEAP32[$bS + 40 >> 2] = tc3 || tc1 ? 2 : 0;
      HEAP32[$bS + 48 >> 2] = tc6 || tc4 ? 2 : 0;
      HEAP32[$bS + 56 >> 2] = tc7 || tc5 ? 2 : 0;
      HEAP32[$bS + 64 >> 2] = tc8 || tc2 ? 2 : 0;
      HEAP32[$bS + 72 >> 2] = tc9 || tc3 ? 2 : 0;
      HEAP32[$bS + 80 >> 2] = tc12 || tc6 ? 2 : 0;
      HEAP32[$bS + 88 >> 2] = tc13 || tc7 ? 2 : 0;
      HEAP32[$bS + 96 >> 2] = tc10 || tc8 ? 2 : 0;
      HEAP32[$bS + 104 >> 2] = tc11 || tc9 ? 2 : 0;
      HEAP32[$bS + 112 >> 2] = tc14 || tc12 ? 2 : 0;
      HEAP32[$bS + 120 >> 2] = tc15 || tc13 ? 2 : 0;

      HEAP32[$bS + 12 >> 2] = tc1 || tc0 ? 2 : 0;
      HEAP32[$bS + 20 >> 2] = tc4 || tc1 ? 2 : 0;
      HEAP32[$bS + 28 >> 2] = tc5 || tc4 ? 2 : 0;
      HEAP32[$bS + 44 >> 2] = tc3 || tc2 ? 2 : 0;
      HEAP32[$bS + 52 >> 2] = tc6 || tc3 ? 2 : 0;
      HEAP32[$bS + 60 >> 2] = tc7 || tc6 ? 2 : 0;
      HEAP32[$bS + 76 >> 2] = tc9 || tc8 ? 2 : 0;
      HEAP32[$bS + 84 >> 2] = tc12 || tc9 ? 2 : 0;
      HEAP32[$bS + 92 >> 2] = tc13 || tc12 ? 2 : 0;
      HEAP32[$bS + 108 >> 2] = tc11 || tc10 ? 2 : 0;
      HEAP32[$bS + 116 >> 2] = tc14 || tc11 ? 2 : 0;
      HEAP32[$bS + 124 >> 2] = tc15 || tc14 ? 2 : 0;
    }

    function OptimizedFilterVerLumaEdge ($data, bS, $thresholds, imageWidth) {
      var delta, tc, tmp;
      var p0, q0, p1, q1, p2, q2;
      var tmpFlag;
      var $clp = _h264bsdClip + 512;
      var alpha = HEAP32[$thresholds + 4 >> 2];
      var beta = HEAP32[$thresholds + 8 >> 2];
      var val;

      if (bS < 4) {
        tmp = tc = HEAPU8[HEAP32[$thresholds >> 2] + (bS - 1)] & 255;
        for (var i = 4; i > 0; i--) {
          p1 = HEAPU8[$data + -2] & 255;
          p0 = HEAPU8[$data + -1] & 255;
          q0 = HEAPU8[$data] & 255;
          q1 = HEAPU8[$data + 1] & 255;
          if ((Math.abs(p0 - q0) < alpha) && (Math.abs(p1 - p0) < beta) && (Math.abs(q1 - q0) < beta)) {
            p2 = HEAPU8[$data - 3] & 255;
            if (Math.abs(p2 - p0) < beta) {
              val = (p2 + ((p0 + q0 + 1) >> 1) - (p1 << 1)) >> 1;
              HEAP8[$data - 2] = p1 + clip(-tc, tc, val);
              tmp++;
            }

            q2 = HEAPU8[$data + 2] & 255;
            if (Math.abs(q2 - q0) < beta) {
              val = (q2 + ((p0 + q0 + 1) >> 1) - (q1 << 1)) >> 1;
              HEAP8[$data + 1] = (q1 + clip(-tc, tc, val));
              tmp++;
            }

            val = ((((q0 - p0) << 2) + (p1 - q1) + 4) >> 3);
            delta = clip(-tmp, tmp, val);

            p0 = HEAPU8[$clp + (p0 + delta)] & 255;
            q0 = HEAPU8[$clp + (q0 - delta)] & 255;
            tmp = tc;
            HEAP8[$data - 1] = p0;
            HEAP8[$data] = q0;

            $data += imageWidth;
          }
        }
      } else {
        OriginalFilterVerLumaEdge($data, bS, $thresholds, imageWidth);
      }
    }

    /**
 * Filter all four successive horizontal 4-pixel luma edges. This can be done when bS is equal to all four edges.
 */
    function OptimizedFilterHorLuma ($data, bS, $thresholds, imageWidth) {
      var delta, tc, tmp;
      var p0, q0, p1, q1, p2, q2;
      var tmpFlag;
      var $clp = _h264bsdClip + 512;
      var alpha = HEAP32[$thresholds + 4 >> 2];
      var beta = HEAP32[$thresholds + 8 >> 2];
      var val;

      if (bS < 4) {
        tmp = tc = HEAPU8[HEAP32[$thresholds >> 2] + (bS - 1)] & 255;
        for (var i = 16; i > 0; i--) {
          p1 = HEAPU8[$data + (-imageWidth << 1)] & 255;
          p0 = HEAPU8[$data + -imageWidth] & 255;
          q0 = HEAPU8[$data] & 255;
          q1 = HEAPU8[$data + imageWidth] & 255;

          if ((Math.abs(p0 - q0) < alpha) && (Math.abs(p1 - p0) < beta) && (Math.abs(q1 - q0) < beta)) {
            p2 = HEAPU8[$data + (-imageWidth * 3)] & 255;
            if (Math.abs(p2 - p0) < beta) {
              val = (p2 + ((p0 + q0 + 1) >> 1) - (p1 << 1)) >> 1;
              HEAP8[$data + (-imageWidth << 1)] = p1 + clip(-tc, tc, val);
              tmp++;
            }

            q2 = HEAPU8[$data + (imageWidth << 2)] & 255;
            if (Math.abs(q2 - q0) < beta) {
              val = (q2 + ((p0 + q0 + 1) >> 1) - (q1 << 1)) >> 1;
              HEAP8[$data + imageWidth] = (q1 + clip(-tc, tc, val));
              tmp++;
            }

            val = ((((q0 - p0) << 2) + (p1 - q1) + 4) >> 3);
            delta = clip(-tmp, tmp, val);

            p0 = HEAPU8[$clp + (p0 + delta)] & 255;
            q0 = HEAPU8[$clp + (q0 - delta)] & 255;
            tmp = tc;
            HEAP8[$data - imageWidth] = p0;
            HEAP8[$data] = q0;

            $data ++;
          }
        }
      } else {
        OriginalFilterHorLuma($data, bS, $thresholds, imageWidth);
      }
    }
  };

  
  Broadway.prototype = {
    configure: function (config) {
      // patchOptimizations(config, patches);
      console.info("Broadway Configured: " + JSON.stringify(config));
    }
    
  };
  
  
  
  
  /*
  
    asm.js implementation of a yuv to rgb convertor
    provided by @soliton4
    
    based on 
    http://www.wordsaretoys.com/2013/10/18/making-yuv-conversion-a-little-faster/
  
  */
  
  
  // factory to create asm.js yuv -> rgb convertor for a given resolution
  var asmInstances = {};
  var getAsm = function(parWidth, parHeight){
    var idStr = "" + parWidth + "x" + parHeight;
    if (asmInstances[idStr]){
      return asmInstances[idStr];
    };

    var lumaSize = parWidth * parHeight;
    var chromaSize = (lumaSize|0) >> 2;

    var inpSize = lumaSize + chromaSize + chromaSize;
    var outSize = parWidth * parHeight * 4;
    var cacheSize = Math.pow(2, 24) * 4;
    var size = inpSize + outSize + cacheSize;

    var chunkSize = Math.pow(2, 24);
    var heapSize = chunkSize;
    while (heapSize < size){
      heapSize += chunkSize;
    };
    var heap = new ArrayBuffer(heapSize);

    var res = asmFactory(global, {}, heap);
    res.init(parWidth, parHeight);
    asmInstances[idStr] = res;

    res.heap = heap;
    res.out = new Uint8Array(heap, 0, outSize);
    res.inp = new Uint8Array(heap, outSize, inpSize);
    res.outSize = outSize;

    return res;
  };


  function asmFactory(stdlib, foreign, heap) {
    "use asm";

    var imul = stdlib.Math.imul;
    var min = stdlib.Math.min;
    var max = stdlib.Math.max;
    var pow = stdlib.Math.pow;
    var out = new stdlib.Uint8Array(heap);
    var out32 = new stdlib.Uint32Array(heap);
    var inp = new stdlib.Uint8Array(heap);
    var mem = new stdlib.Uint8Array(heap);
    var mem32 = new stdlib.Uint32Array(heap);

    // for double algo
    /*var vt = 1.370705;
    var gt = 0.698001;
    var gt2 = 0.337633;
    var bt = 1.732446;*/

    var width = 0;
    var height = 0;
    var lumaSize = 0;
    var chromaSize = 0;
    var inpSize = 0;
    var outSize = 0;

    var inpStart = 0;
    var outStart = 0;

    var widthFour = 0;

    var cacheStart = 0;


    function init(parWidth, parHeight){
      parWidth = parWidth|0;
      parHeight = parHeight|0;

      var i = 0;
      var s = 0;

      width = parWidth;
      widthFour = imul(parWidth, 4)|0;
      height = parHeight;
      lumaSize = imul(width|0, height|0)|0;
      chromaSize = (lumaSize|0) >> 2;
      outSize = imul(imul(width, height)|0, 4)|0;
      inpSize = ((lumaSize + chromaSize)|0 + chromaSize)|0;

      outStart = 0;
      inpStart = (outStart + outSize)|0;
      cacheStart = (inpStart + inpSize)|0;

      // initializing memory (to be on the safe side)
      s = ~~(+pow(+2, +24));
      s = imul(s, 4)|0;

      for (i = 0|0; ((i|0) < (s|0))|0; i = (i + 4)|0){
        mem32[((cacheStart + i)|0) >> 2] = 0;
      };
    };

    function doit(){
      var ystart = 0;
      var ustart = 0;
      var vstart = 0;

      var y = 0;
      var yn = 0;
      var u = 0;
      var v = 0;

      var o = 0;

      var line = 0;
      var col = 0;

      var usave = 0;
      var vsave = 0;

      var ostart = 0;
      var cacheAdr = 0;

      ostart = outStart|0;

      ystart = inpStart|0;
      ustart = (ystart + lumaSize|0)|0;
      vstart = (ustart + chromaSize)|0;

      for (line = 0; (line|0) < (height|0); line = (line + 2)|0){
        usave = ustart;
        vsave = vstart;
        for (col = 0; (col|0) < (width|0); col = (col + 2)|0){
          y = inp[ystart >> 0]|0;
          yn = inp[((ystart + width)|0) >> 0]|0;

          u = inp[ustart >> 0]|0;
          v = inp[vstart >> 0]|0;

          cacheAdr = (((((y << 16)|0) + ((u << 8)|0))|0) + v)|0;
          o = mem32[((cacheStart + cacheAdr)|0) >> 2]|0;
          if (o){}else{
            o = yuv2rgbcalc(y,u,v)|0;
            mem32[((cacheStart + cacheAdr)|0) >> 2] = o|0;
          };
          mem32[ostart >> 2] = o;

          cacheAdr = (((((yn << 16)|0) + ((u << 8)|0))|0) + v)|0;
          o = mem32[((cacheStart + cacheAdr)|0) >> 2]|0;
          if (o){}else{
            o = yuv2rgbcalc(yn,u,v)|0;
            mem32[((cacheStart + cacheAdr)|0) >> 2] = o|0;
          };
          mem32[((ostart + widthFour)|0) >> 2] = o;

          //yuv2rgb5(y, u, v, ostart);
          //yuv2rgb5(yn, u, v, (ostart + widthFour)|0);
          ostart = (ostart + 4)|0;

          // next step only for y. u and v stay the same
          ystart = (ystart + 1)|0;
          y = inp[ystart >> 0]|0;
          yn = inp[((ystart + width)|0) >> 0]|0;

          //yuv2rgb5(y, u, v, ostart);
          cacheAdr = (((((y << 16)|0) + ((u << 8)|0))|0) + v)|0;
          o = mem32[((cacheStart + cacheAdr)|0) >> 2]|0;
          if (o){}else{
            o = yuv2rgbcalc(y,u,v)|0;
            mem32[((cacheStart + cacheAdr)|0) >> 2] = o|0;
          };
          mem32[ostart >> 2] = o;

          //yuv2rgb5(yn, u, v, (ostart + widthFour)|0);
          cacheAdr = (((((yn << 16)|0) + ((u << 8)|0))|0) + v)|0;
          o = mem32[((cacheStart + cacheAdr)|0) >> 2]|0;
          if (o){}else{
            o = yuv2rgbcalc(yn,u,v)|0;
            mem32[((cacheStart + cacheAdr)|0) >> 2] = o|0;
          };
          mem32[((ostart + widthFour)|0) >> 2] = o;
          ostart = (ostart + 4)|0;

          //all positions inc 1

          ystart = (ystart + 1)|0;
          ustart = (ustart + 1)|0;
          vstart = (vstart + 1)|0;
        };
        ostart = (ostart + widthFour)|0;
        ystart = (ystart + width)|0;

      };

    };

    function yuv2rgbcalc(y, u, v){
      y = y|0;
      u = u|0;
      v = v|0;

      var r = 0;
      var g = 0;
      var b = 0;

      var o = 0;

      var a0 = 0;
      var a1 = 0;
      var a2 = 0;
      var a3 = 0;
      var a4 = 0;

      a0 = imul(1192, (y - 16)|0)|0;
      a1 = imul(1634, (v - 128)|0)|0;
      a2 = imul(832, (v - 128)|0)|0;
      a3 = imul(400, (u - 128)|0)|0;
      a4 = imul(2066, (u - 128)|0)|0;

      r = (((a0 + a1)|0) >> 10)|0;
      g = (((((a0 - a2)|0) - a3)|0) >> 10)|0;
      b = (((a0 + a4)|0) >> 10)|0;

      if ((((r & 255)|0) != (r|0))|0){
        r = min(255, max(0, r|0)|0)|0;
      };
      if ((((g & 255)|0) != (g|0))|0){
        g = min(255, max(0, g|0)|0)|0;
      };
      if ((((b & 255)|0) != (b|0))|0){
        b = min(255, max(0, b|0)|0)|0;
      };

      o = 255;
      o = (o << 8)|0;
      o = (o + b)|0;
      o = (o << 8)|0;
      o = (o + g)|0;
      o = (o << 8)|0;
      o = (o + r)|0;

      return o|0;

    };



    return {
      init: init,
      doit: doit
    };
  };

  
  /*
    potential worker initialization
  
  */
  
  
  if (typeof self != "undefined"){
    var isWorker = false;
    var decoder;
    var reuseMemory = false;
    
    var memAr = [];
    var getMem = function(length){
      if (memAr.length){
        var u = memAr.shift();
        while (u && u.byteLength !== length){
          u = memAr.shift();
        };
        if (u){
          return u;
        };
      };
      return new ArrayBuffer(length);
    }; 
    
    self.addEventListener('message', function(e) {
      
      if (isWorker){
        if (reuseMemory){
          if (e.data.reuse){
            memAr.push(e.data.reuse);
          };
        };
        if (e.data.buf){
          decoder.decode(new Uint8Array(e.data.buf, e.data.offset || 0, e.data.length), e.data.info);
        };
        
      }else{
        if (e.data && e.data.type === "Broadway.js - Worker init"){
          isWorker = true;
          decoder = new Broadway(e.data.options);
          
          if (e.data.options.reuseMemory){
            reuseMemory = true;
            decoder.onPictureDecoded = function (buffer, width, height, infos) {
              
              //var buf = getMem();

              // buffer needs to be copied because we give up ownership
              var copyU8 = new Uint8Array(getMem(buffer.length));
              copyU8.set( buffer, 0, buffer.length );

              postMessage({
                buf: copyU8.buffer, 
                length: buffer.length,
                width: width, 
                height: height, 
                infos: infos
              }, [copyU8.buffer]); // 2nd parameter is used to indicate transfer of ownership

            };
            
          }else{
            decoder.onPictureDecoded = function (buffer, width, height, infos) {
              if (buffer) {
                buffer = new Uint8Array(buffer);
              };

              // buffer needs to be copied because we give up ownership
              var copyU8 = new Uint8Array(buffer.length);
              copyU8.set( buffer, 0, buffer.length );

              postMessage({
                buf: copyU8.buffer, 
                length: buffer.length,
                width: width, 
                height: height, 
                infos: infos
              }, [copyU8.buffer]); // 2nd parameter is used to indicate transfer of ownership

            };
          };
          postMessage({ consoleLog: "broadway worker initialized" });
        };
      };


    }, false);
  };
  
  Broadway.nowValue = nowValue;
  
  return Broadway;
  
  })();
  
  
}));


}).call(this,"/dvp\\node_modules\\h264-live-player\\vendor\\broadway")
},{}],5:[function(require,module,exports){
"use strict";
var assert = require('../utils/assert');


function Program(gl) {
  this.gl = gl;
  this.program = this.gl.createProgram();
}

Program.prototype = {
  attach: function (shader) {
    this.gl.attachShader(this.program, shader.shader);
  }, 
  link: function () {
    this.gl.linkProgram(this.program);
    // If creating the shader program failed, alert.
    assert(this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS),
           "Unable to initialize the shader program.");
  },
  use: function () {
    this.gl.useProgram(this.program);
  },
  getAttributeLocation: function(name) {
    return this.gl.getAttribLocation(this.program, name);
  },
  setMatrixUniform: function(name, array) {
    var uniform = this.gl.getUniformLocation(this.program, name);
    this.gl.uniformMatrix4fv(uniform, false, array);
  }
};
module.exports = Program;


},{"../utils/assert":20}],6:[function(require,module,exports){
"use strict";

var assert = require('../utils/assert');

/**
 * Represents a WebGL shader script.
 */

function Script() {}

Script.createFromElementId = function(id) {
  var script = document.getElementById(id);
  
  // Didn't find an element with the specified ID, abort.
  assert(script , "Could not find shader with ID: " + id);
  
  // Walk through the source element's children, building the shader source string.
  var source = "";
  var currentChild = script .firstChild;
  while(currentChild) {
    if (currentChild.nodeType == 3) {
      source += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
  
  var res = new Scriptor();
  res.type = script.type;
  res.source = source;
  return res;
};

Script.createFromSource = function(type, source) {
  var res = new Script();
  res.type = type;
  res.source = source;
  return res;
}


module.exports = Script;
},{"../utils/assert":20}],7:[function(require,module,exports){
"use strict";

var error = require('../utils/error');

/**
 * Represents a WebGL shader object and provides a mechanism to load shaders from HTML
 * script tags.
 */


function Shader(gl, script) {
  
  // Now figure out what type of shader script we have, based on its MIME type.
  if (script.type == "x-shader/x-fragment") {
    this.shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (script.type == "x-shader/x-vertex") {
    this.shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    error("Unknown shader type: " + script.type);
    return;
  }
  
  // Send the source to the shader object.
  gl.shaderSource(this.shader, script.source);
  
  // Compile the shader program.
  gl.compileShader(this.shader);
  
  // See if it compiled successfully.
  if (!gl.getShaderParameter(this.shader, gl.COMPILE_STATUS)) {
    error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(this.shader));
    return;
  }
}
module.exports = Shader;




},{"../utils/error":21}],8:[function(require,module,exports){
"use strict";

var assert = require('../utils/assert');

/**
 * Represents a WebGL texture object.
 */

function Texture(gl, size, format) {
  this.gl = gl;
  this.size = size;
  this.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  this.format = format ? format : gl.LUMINANCE; 
  gl.texImage2D(gl.TEXTURE_2D, 0, this.format, size.w, size.h, 0, this.format, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

var textureIDs = null;
Texture.prototype = {
  fill: function(textureData, useTexSubImage2D) {
    var gl = this.gl;
    assert(textureData.length >= this.size.w * this.size.h, 
           "Texture size mismatch, data:" + textureData.length + ", texture: " + this.size.w * this.size.h);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (useTexSubImage2D) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size.w , this.size.h, this.format, gl.UNSIGNED_BYTE, textureData);
    } else {
      // texImage2D seems to be faster, thus keeping it as the default
      gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.size.w, this.size.h, 0, this.format, gl.UNSIGNED_BYTE, textureData);
    }
  },
  bind: function(n, program, name) {
    var gl = this.gl;
    if (!textureIDs) {
      textureIDs = [gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2];
    }
    gl.activeTexture(textureIDs[n]);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program.program, name), n);
  }
};
module.exports = Texture;


},{"../utils/assert":20}],9:[function(require,module,exports){
"use strict";

/**
 * Generic WebGL backed canvas that sets up: a quad to paint a texture on, appropriate vertex/fragment shaders,
 * scene parameters and other things. Specialized versions of this class can be created by overriding several 
 * initialization methods.

 */

var Script = require('./Script');
var error  = require('../utils/error');
var makePerspective  = require('../utils/glUtils').makePerspective;
var Matrix = require('sylvester.js').Matrix;
var Class  = require('uclass');
  

var vertexShaderScript = Script.createFromSource("x-shader/x-vertex", `
  attribute vec3 aVertexPosition;
  attribute vec2 aTextureCoord;
  uniform mat4 uMVMatrix;
  uniform mat4 uPMatrix;
  varying highp vec2 vTextureCoord;
  void main(void) {
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
    vTextureCoord = aTextureCoord;
  }
`);

var fragmentShaderScript = Script.createFromSource("x-shader/x-fragment", `
  precision highp float;
  varying highp vec2 vTextureCoord;
  uniform sampler2D texture;
  void main(void) {
    gl_FragColor = texture2D(texture, vTextureCoord);
  }
`);

var WebGLCanvas = new Class({

  initialize : function(canvas, size, useFrameBuffer) {

    this.canvas = canvas;
    this.size = size;
    this.canvas.width = size.w;
    this.canvas.height = size.h;
    
    this.onInitWebGL();
    this.onInitShaders();
    this.initBuffers();

    if (useFrameBuffer)
      this.initFramebuffer();

    this.onInitTextures();
    this.initScene();
  },


/**
 * Initialize a frame buffer so that we can render off-screen.
 */
  initFramebuffer : function() {

    var gl = this.gl;

    // Create framebuffer object and texture.
    this.framebuffer = gl.createFramebuffer(); 
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.framebufferTexture = new Texture(this.gl, this.size, gl.RGBA);

    // Create and allocate renderbuffer for depth data.
    var renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.size.w, this.size.h);

    // Attach texture and renderbuffer to the framebuffer.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.framebufferTexture.texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);
  },



/**
 * Initialize vertex and texture coordinate buffers for a plane.
 */
  initBuffers : function () {
    var tmp;
    var gl = this.gl;
    
    // Create vertex position buffer.
    this.quadVPBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVPBuffer);
    tmp = [
       1.0,  1.0, 0.0,
      -1.0,  1.0, 0.0, 
       1.0, -1.0, 0.0, 
      -1.0, -1.0, 0.0];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tmp), gl.STATIC_DRAW);
    this.quadVPBuffer.itemSize = 3;
    this.quadVPBuffer.numItems = 4;
    
    /*
     +--------------------+ 
     | -1,1 (1)           | 1,1 (0)
     |                    |
     |                    |
     |                    |
     |                    |
     |                    |
     | -1,-1 (3)          | 1,-1 (2)
     +--------------------+
     */
    
    var scaleX = 1.0;
    var scaleY = 1.0;
    
    // Create vertex texture coordinate buffer.
    this.quadVTCBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVTCBuffer);
    tmp = [
      scaleX, 0.0,
      0.0, 0.0,
      scaleX, scaleY,
      0.0, scaleY,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tmp), gl.STATIC_DRAW);
  },


  mvIdentity : function () {
    this.mvMatrix = Matrix.I(4);
  },

  mvMultiply : function(m) {
    this.mvMatrix = this.mvMatrix.x(m);
  },

  mvTranslate : function (m) {
    this.mvMultiply(Matrix.Translation($V([m[0], m[1], m[2]])).ensure4x4());
  },

  setMatrixUniforms : function () {
    this.program.setMatrixUniform("uPMatrix", new Float32Array(this.perspectiveMatrix.flatten()));
    this.program.setMatrixUniform("uMVMatrix", new Float32Array(this.mvMatrix.flatten()));
  },

  initScene : function() {
    var gl = this.gl;
    
    // Establish the perspective with which we want to view the
    // scene. Our field of view is 45 degrees, with a width/height
    // ratio of 640:480, and we only want to see objects between 0.1 units
    // and 100 units away from the camera.
    
    this.perspectiveMatrix = makePerspective(45, 1, 0.1, 100.0);
    
    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    this.mvIdentity();

    // Now move the drawing position a bit to where we want to start
    // drawing the square.
    this.mvTranslate([0.0, 0.0, -2.4]);

    // Draw the cube by binding the array buffer to the cube's vertices
    // array, setting attributes, and pushing it to GL.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVPBuffer);
    gl.vertexAttribPointer(this.vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
    
    // Set the texture coordinates attribute for the vertices.
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVTCBuffer);
    gl.vertexAttribPointer(this.textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);  
    
    this.onInitSceneTextures();
    
    this.setMatrixUniforms();
    
    if (this.framebuffer) {
      console.log("Bound Frame Buffer");
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    }
  },



  toString: function() {
    return "WebGLCanvas Size: " + this.size;
  },

  checkLastError: function (operation) {
    var err = this.gl.getError();
    if (err != this.gl.NO_ERROR) {
      var name = this.glNames[err];
      name = (name !== undefined) ? name + "(" + err + ")":
          ("Unknown WebGL ENUM (0x" + value.toString(16) + ")");
      if (operation) {
        console.log("WebGL Error: %s, %s", operation, name);
      } else {
        console.log("WebGL Error: %s", name);
      }
      console.trace();
    }
  },

  onInitWebGL: function () {
    try {
      this.gl = this.canvas.getContext("experimental-webgl");
    } catch(e) {}
    
    if (!this.gl) {
      error("Unable to initialize WebGL. Your browser may not support it.");
    }
    if (this.glNames) {
      return;
    }
    this.glNames = {};
    for (var propertyName in this.gl) {
      if (typeof this.gl[propertyName] == 'number') {
        this.glNames[this.gl[propertyName]] = propertyName;
      }
    }
  },

  onInitShaders: function() {
    this.program = new Program(this.gl);
    this.program.attach(new Shader(this.gl, vertexShaderScript));
    this.program.attach(new Shader(this.gl, fragmentShaderScript));
    this.program.link();
    this.program.use();
    this.vertexPositionAttribute = this.program.getAttributeLocation("aVertexPosition");
    this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
    this.textureCoordAttribute = this.program.getAttributeLocation("aTextureCoord");;
    this.gl.enableVertexAttribArray(this.textureCoordAttribute);
  },

  onInitTextures: function () {
    var gl = this.gl;
    this.texture = new Texture(gl, this.size, gl.RGBA);
  },

  onInitSceneTextures: function () {
    this.texture.bind(0, this.program, "texture");
  },

  drawScene: function() {
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  },

  readPixels: function(buffer) {
    var gl = this.gl;
    gl.readPixels(0, 0, this.size.w, this.size.h, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  },


});



module.exports = WebGLCanvas;

},{"../utils/error":21,"../utils/glUtils":22,"./Script":6,"sylvester.js":12,"uclass":47}],10:[function(require,module,exports){
"use strict";
var Class = require('uclass');

var YUVCanvas = new Class({

  Binds : ['decode'],

  initialize : function(canvas, size) {
    this.canvas = canvas;
    this.canvasCtx = this.canvas.getContext("2d");
    this.canvasBuffer = this.canvasCtx.createImageData(size.w, size.h);
  },

  decode : function (buffer, width, height) {
    if (!buffer)
      return;

    var lumaSize = width * height;
    var chromaSize = lumaSize >> 2;
    
    var ybuf = buffer.subarray(0, lumaSize);
    var ubuf = buffer.subarray(lumaSize, lumaSize + chromaSize);
    var vbuf = buffer.subarray(lumaSize + chromaSize, lumaSize + 2 * chromaSize);
    
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var yIndex = x + y * width;
        var uIndex = ~~(y / 2) * ~~(width / 2) + ~~(x / 2);
        var vIndex = ~~(y / 2) * ~~(width / 2) + ~~(x / 2);
        var R = 1.164 * (ybuf[yIndex] - 16) + 1.596 * (vbuf[vIndex] - 128);
        var G = 1.164 * (ybuf[yIndex] - 16) - 0.813 * (vbuf[vIndex] - 128) - 0.391 * (ubuf[uIndex] - 128);
        var B = 1.164 * (ybuf[yIndex] - 16) + 2.018 * (ubuf[uIndex] - 128);
        
        var rgbIndex = yIndex * 4;
        this.canvasBuffer.data[rgbIndex+0] = R;
        this.canvasBuffer.data[rgbIndex+1] = G;
        this.canvasBuffer.data[rgbIndex+2] = B;
        this.canvasBuffer.data[rgbIndex+3] = 0xff;
      }
    }
    
    this.canvasCtx.putImageData(this.canvasBuffer, 0, 0);
    
    var date = new Date();
    //console.log("WSAvcPlayer: Decode time: " + (date.getTime() - this.rcvtime) + " ms");
  },

});


module.exports = YUVCanvas;
},{"uclass":47}],11:[function(require,module,exports){
"use strict";

var Program     = require('./Program');
var Shader      = require('./Shader');
var Texture     = require('./Texture');
var Script      = require('./Script');
var WebGLCanvas = require('./WebGLCanvas');

var Class       = require('uclass');

var vertexShaderScript = Script.createFromSource("x-shader/x-vertex", `
  attribute vec3 aVertexPosition;
  attribute vec2 aTextureCoord;
  uniform mat4 uMVMatrix;
  uniform mat4 uPMatrix;
  varying highp vec2 vTextureCoord;
  void main(void) {
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
    vTextureCoord = aTextureCoord;
  }
`);


var fragmentShaderScript = Script.createFromSource("x-shader/x-fragment", `
  precision highp float;
  varying highp vec2 vTextureCoord;
  uniform sampler2D YTexture;
  uniform sampler2D UTexture;
  uniform sampler2D VTexture;
  const mat4 YUV2RGB = mat4
  (
   1.1643828125, 0, 1.59602734375, -.87078515625,
   1.1643828125, -.39176171875, -.81296875, .52959375,
   1.1643828125, 2.017234375, 0, -1.081390625,
   0, 0, 0, 1
  );

  void main(void) {
   gl_FragColor = vec4( texture2D(YTexture,  vTextureCoord).x, texture2D(UTexture, vTextureCoord).x, texture2D(VTexture, vTextureCoord).x, 1) * YUV2RGB;
  }
`);




var YUVWebGLCanvas = new Class({
  Extends  : WebGLCanvas,
  Binds : ['decode'],

  initialize : function(canvas, size) {
    YUVWebGLCanvas.parent.initialize.call(this, canvas, size);
  },

  onInitShaders: function() {
    this.program = new Program(this.gl);
    this.program.attach(new Shader(this.gl, vertexShaderScript));
    this.program.attach(new Shader(this.gl, fragmentShaderScript));
    this.program.link();
    this.program.use();
    this.vertexPositionAttribute = this.program.getAttributeLocation("aVertexPosition");
    this.gl.enableVertexAttribArray(this.vertexPositionAttribute);
    this.textureCoordAttribute = this.program.getAttributeLocation("aTextureCoord");;
    this.gl.enableVertexAttribArray(this.textureCoordAttribute);
  },

  onInitTextures: function () {
    console.log("creatingTextures: size: " + this.size);
    this.YTexture = new Texture(this.gl, this.size);
    this.UTexture = new Texture(this.gl, this.size.getHalfSize());
    this.VTexture = new Texture(this.gl, this.size.getHalfSize());
  },

  onInitSceneTextures: function () {
    this.YTexture.bind(0, this.program, "YTexture");
    this.UTexture.bind(1, this.program, "UTexture");
    this.VTexture.bind(2, this.program, "VTexture");
  },

  fillYUVTextures: function(y, u, v) {
    this.YTexture.fill(y);
    this.UTexture.fill(u);
    this.VTexture.fill(v);
  },

  decode: function(buffer, width, height) {

    if (!buffer)
      return;

    var lumaSize = width * height;
    var chromaSize = lumaSize >> 2;

    this.YTexture.fill(buffer.subarray(0, lumaSize));
    this.UTexture.fill(buffer.subarray(lumaSize, lumaSize + chromaSize));
    this.VTexture.fill(buffer.subarray(lumaSize + chromaSize, lumaSize + 2 * chromaSize));
    this.drawScene();
  },

  toString: function() {
    return "YUVCanvas Size: " + this.size;
  }
});





module.exports = YUVWebGLCanvas;

},{"./Program":5,"./Script":6,"./Shader":7,"./Texture":8,"./WebGLCanvas":9,"uclass":47}],12:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel

var global = (Function('return this'))();

exports.Vector = require('./vector');
global.$V = exports.Vector.create;
exports.Matrix = require('./matrix');
global.$M = exports.Matrix.create;
exports.Line = require('./line');
global.$L = exports.Line.create;
exports.Plane = require('./plane');
global.$P = exports.Plane.create;
exports.Line.Segment = require('./line.segment');
exports.Sylvester = require('./sylvester');

},{"./line":13,"./line.segment":14,"./matrix":15,"./plane":16,"./sylvester":17,"./vector":18}],13:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
var Vector = require('./vector');
var Matrix = require('./matrix');
var Plane = require('./plane');
var Sylvester = require('./sylvester');

// Line class - depends on Vector, and some methods require Matrix and Plane.

function Line() {}
Line.prototype = {

  // Returns true if the argument occupies the same space as the line
  eql: function(line) {
    return (this.isParallelTo(line) && this.contains(line.anchor));
  },

  // Returns a copy of the line
  dup: function() {
    return Line.create(this.anchor, this.direction);
  },

  // Returns the result of translating the line by the given vector/array
  translate: function(vector) {
    var V = vector.elements || vector;
    return Line.create([
      this.anchor.elements[0] + V[0],
      this.anchor.elements[1] + V[1],
      this.anchor.elements[2] + (V[2] || 0)
    ], this.direction);
  },

  // Returns true if the line is parallel to the argument. Here, 'parallel to'
  // means that the argument's direction is either parallel or antiparallel to
  // the line's own direction. A line is parallel to a plane if the two do not
  // have a unique intersection.
  isParallelTo: function(obj) {
    if (obj.normal || (obj.start && obj.end)) { return obj.isParallelTo(this); }
    var theta = this.direction.angleFrom(obj.direction);
    return (Math.abs(theta) <= Sylvester.precision || Math.abs(theta - Math.PI) <= Sylvester.precision);
  },

  // Returns the line's perpendicular distance from the argument,
  // which can be a point, a line or a plane
  distanceFrom: function(obj) {
    if (obj.normal || (obj.start && obj.end)) { return obj.distanceFrom(this); }
    if (obj.direction) {
      // obj is a line
      if (this.isParallelTo(obj)) { return this.distanceFrom(obj.anchor); }
      var N = this.direction.cross(obj.direction).toUnitVector().elements;
      var A = this.anchor.elements, B = obj.anchor.elements;
      return Math.abs((A[0] - B[0]) * N[0] + (A[1] - B[1]) * N[1] + (A[2] - B[2]) * N[2]);
    } else {
      // obj is a point
      var P = obj.elements || obj;
      var A = this.anchor.elements, D = this.direction.elements;
      var PA1 = P[0] - A[0], PA2 = P[1] - A[1], PA3 = (P[2] || 0) - A[2];
      var modPA = Math.sqrt(PA1*PA1 + PA2*PA2 + PA3*PA3);
      if (modPA === 0) return 0;
      // Assumes direction vector is normalized
      var cosTheta = (PA1 * D[0] + PA2 * D[1] + PA3 * D[2]) / modPA;
      var sin2 = 1 - cosTheta*cosTheta;
      return Math.abs(modPA * Math.sqrt(sin2 < 0 ? 0 : sin2));
    }
  },

  // Returns true iff the argument is a point on the line, or if the argument
  // is a line segment lying within the receiver
  contains: function(obj) {
    if (obj.start && obj.end) { return this.contains(obj.start) && this.contains(obj.end); }
    var dist = this.distanceFrom(obj);
    return (dist !== null && dist <= Sylvester.precision);
  },

  // Returns the distance from the anchor of the given point. Negative values are
  // returned for points that are in the opposite direction to the line's direction from
  // the line's anchor point.
  positionOf: function(point) {
    if (!this.contains(point)) { return null; }
    var P = point.elements || point;
    var A = this.anchor.elements, D = this.direction.elements;
    return (P[0] - A[0]) * D[0] + (P[1] - A[1]) * D[1] + ((P[2] || 0) - A[2]) * D[2];
  },

  // Returns true iff the line lies in the given plane
  liesIn: function(plane) {
    return plane.contains(this);
  },

  // Returns true iff the line has a unique point of intersection with the argument
  intersects: function(obj) {
    if (obj.normal) { return obj.intersects(this); }
    return (!this.isParallelTo(obj) && this.distanceFrom(obj) <= Sylvester.precision);
  },

  // Returns the unique intersection point with the argument, if one exists
  intersectionWith: function(obj) {
    if (obj.normal || (obj.start && obj.end)) { return obj.intersectionWith(this); }
    if (!this.intersects(obj)) { return null; }
    var P = this.anchor.elements, X = this.direction.elements,
        Q = obj.anchor.elements, Y = obj.direction.elements;
    var X1 = X[0], X2 = X[1], X3 = X[2], Y1 = Y[0], Y2 = Y[1], Y3 = Y[2];
    var PsubQ1 = P[0] - Q[0], PsubQ2 = P[1] - Q[1], PsubQ3 = P[2] - Q[2];
    var XdotQsubP = - X1*PsubQ1 - X2*PsubQ2 - X3*PsubQ3;
    var YdotPsubQ = Y1*PsubQ1 + Y2*PsubQ2 + Y3*PsubQ3;
    var XdotX = X1*X1 + X2*X2 + X3*X3;
    var YdotY = Y1*Y1 + Y2*Y2 + Y3*Y3;
    var XdotY = X1*Y1 + X2*Y2 + X3*Y3;
    var k = (XdotQsubP * YdotY / XdotX + XdotY * YdotPsubQ) / (YdotY - XdotY * XdotY);
    return Vector.create([P[0] + k*X1, P[1] + k*X2, P[2] + k*X3]);
  },

  // Returns the point on the line that is closest to the given point or line/line segment
  pointClosestTo: function(obj) {
    if (obj.start && obj.end) {
      // obj is a line segment
      var P = obj.pointClosestTo(this);
      return (P === null) ? null : this.pointClosestTo(P);
    } else if (obj.direction) {
      // obj is a line
      if (this.intersects(obj)) { return this.intersectionWith(obj); }
      if (this.isParallelTo(obj)) { return null; }
      var D = this.direction.elements, E = obj.direction.elements;
      var D1 = D[0], D2 = D[1], D3 = D[2], E1 = E[0], E2 = E[1], E3 = E[2];
      // Create plane containing obj and the shared normal and intersect this with it
      // Thank you: http://www.cgafaq.info/wiki/Line-line_distance
      var x = (D3 * E1 - D1 * E3), y = (D1 * E2 - D2 * E1), z = (D2 * E3 - D3 * E2);
      var N = [x * E3 - y * E2, y * E1 - z * E3, z * E2 - x * E1];
      var P = Plane.create(obj.anchor, N);
      return P.intersectionWith(this);
    } else {
      // obj is a point
      var P = obj.elements || obj;
      if (this.contains(P)) { return Vector.create(P); }
      var A = this.anchor.elements, D = this.direction.elements;
      var D1 = D[0], D2 = D[1], D3 = D[2], A1 = A[0], A2 = A[1], A3 = A[2];
      var x = D1 * (P[1]-A2) - D2 * (P[0]-A1), y = D2 * ((P[2] || 0) - A3) - D3 * (P[1]-A2),
          z = D3 * (P[0]-A1) - D1 * ((P[2] || 0) - A3);
      var V = Vector.create([D2 * x - D3 * z, D3 * y - D1 * x, D1 * z - D2 * y]);
      var k = this.distanceFrom(P) / V.modulus();
      return Vector.create([
        P[0] + V.elements[0] * k,
        P[1] + V.elements[1] * k,
        (P[2] || 0) + V.elements[2] * k
      ]);
    }
  },

  // Returns a copy of the line rotated by t radians about the given line. Works by
  // finding the argument's closest point to this line's anchor point (call this C) and
  // rotating the anchor about C. Also rotates the line's direction about the argument's.
  // Be careful with this - the rotation axis' direction affects the outcome!
  rotate: function(t, line) {
    // If we're working in 2D
    if (typeof(line.direction) == 'undefined') { line = Line.create(line.to3D(), Vector.k); }
    var R = Matrix.Rotation(t, line.direction).elements;
    var C = line.pointClosestTo(this.anchor).elements;
    var A = this.anchor.elements, D = this.direction.elements;
    var C1 = C[0], C2 = C[1], C3 = C[2], A1 = A[0], A2 = A[1], A3 = A[2];
    var x = A1 - C1, y = A2 - C2, z = A3 - C3;
    return Line.create([
      C1 + R[0][0] * x + R[0][1] * y + R[0][2] * z,
      C2 + R[1][0] * x + R[1][1] * y + R[1][2] * z,
      C3 + R[2][0] * x + R[2][1] * y + R[2][2] * z
    ], [
      R[0][0] * D[0] + R[0][1] * D[1] + R[0][2] * D[2],
      R[1][0] * D[0] + R[1][1] * D[1] + R[1][2] * D[2],
      R[2][0] * D[0] + R[2][1] * D[1] + R[2][2] * D[2]
    ]);
  },

  // Returns a copy of the line with its direction vector reversed.
  // Useful when using lines for rotations.
  reverse: function() {
    return Line.create(this.anchor, this.direction.x(-1));
  },

  // Returns the line's reflection in the given point or line
  reflectionIn: function(obj) {
    if (obj.normal) {
      // obj is a plane
      var A = this.anchor.elements, D = this.direction.elements;
      var A1 = A[0], A2 = A[1], A3 = A[2], D1 = D[0], D2 = D[1], D3 = D[2];
      var newA = this.anchor.reflectionIn(obj).elements;
      // Add the line's direction vector to its anchor, then mirror that in the plane
      var AD1 = A1 + D1, AD2 = A2 + D2, AD3 = A3 + D3;
      var Q = obj.pointClosestTo([AD1, AD2, AD3]).elements;
      var newD = [Q[0] + (Q[0] - AD1) - newA[0], Q[1] + (Q[1] - AD2) - newA[1], Q[2] + (Q[2] - AD3) - newA[2]];
      return Line.create(newA, newD);
    } else if (obj.direction) {
      // obj is a line - reflection obtained by rotating PI radians about obj
      return this.rotate(Math.PI, obj);
    } else {
      // obj is a point - just reflect the line's anchor in it
      var P = obj.elements || obj;
      return Line.create(this.anchor.reflectionIn([P[0], P[1], (P[2] || 0)]), this.direction);
    }
  },

  // Set the line's anchor point and direction.
  setVectors: function(anchor, direction) {
    // Need to do this so that line's properties are not
    // references to the arguments passed in
    anchor = Vector.create(anchor);
    direction = Vector.create(direction);
    if (anchor.elements.length == 2) {anchor.elements.push(0); }
    if (direction.elements.length == 2) { direction.elements.push(0); }
    if (anchor.elements.length > 3 || direction.elements.length > 3) { return null; }
    var mod = direction.modulus();
    if (mod === 0) { return null; }
    this.anchor = anchor;
    this.direction = Vector.create([
      direction.elements[0] / mod,
      direction.elements[1] / mod,
      direction.elements[2] / mod
    ]);
    return this;
  }
};

// Constructor function
Line.create = function(anchor, direction) {
  var L = new Line();
  return L.setVectors(anchor, direction);
};

// Axes
Line.X = Line.create(Vector.Zero(3), Vector.i);
Line.Y = Line.create(Vector.Zero(3), Vector.j);
Line.Z = Line.create(Vector.Zero(3), Vector.k);

module.exports = Line;

},{"./matrix":15,"./plane":16,"./sylvester":17,"./vector":18}],14:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
// Line.Segment class - depends on Line and its dependencies.

var Line = require('./line');
var Vector = require('./vector');

Line.Segment = function() {};
Line.Segment.prototype = {

  // Returns true iff the line segment is equal to the argument
  eql: function(segment) {
    return (this.start.eql(segment.start) && this.end.eql(segment.end)) ||
        (this.start.eql(segment.end) && this.end.eql(segment.start));
  },

  // Returns a copy of the line segment
  dup: function() {
    return Line.Segment.create(this.start, this.end);
  },

  // Returns the length of the line segment
  length: function() {
    var A = this.start.elements, B = this.end.elements;
    var C1 = B[0] - A[0], C2 = B[1] - A[1], C3 = B[2] - A[2];
    return Math.sqrt(C1*C1 + C2*C2 + C3*C3);
  },

  // Returns the line segment as a vector equal to its
  // end point relative to its endpoint
  toVector: function() {
    var A = this.start.elements, B = this.end.elements;
    return Vector.create([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
  },

  // Returns the segment's midpoint as a vector
  midpoint: function() {
    var A = this.start.elements, B = this.end.elements;
    return Vector.create([(B[0] + A[0])/2, (B[1] + A[1])/2, (B[2] + A[2])/2]);
  },

  // Returns the plane that bisects the segment
  bisectingPlane: function() {
    return Plane.create(this.midpoint(), this.toVector());
  },

  // Returns the result of translating the line by the given vector/array
  translate: function(vector) {
    var V = vector.elements || vector;
    var S = this.start.elements, E = this.end.elements;
    return Line.Segment.create(
      [S[0] + V[0], S[1] + V[1], S[2] + (V[2] || 0)],
      [E[0] + V[0], E[1] + V[1], E[2] + (V[2] || 0)]
    );
  },

  // Returns true iff the line segment is parallel to the argument. It simply forwards
  // the method call onto its line property.
  isParallelTo: function(obj) {
    return this.line.isParallelTo(obj);
  },

  // Returns the distance between the argument and the line segment's closest point to the argument
  distanceFrom: function(obj) {
    var P = this.pointClosestTo(obj);
    return (P === null) ? null : P.distanceFrom(obj);
  },

  // Returns true iff the given point lies on the segment
  contains: function(obj) {
    if (obj.start && obj.end) { return this.contains(obj.start) && this.contains(obj.end); }
    var P = (obj.elements || obj).slice();
    if (P.length == 2) { P.push(0); }
    if (this.start.eql(P)) { return true; }
    var S = this.start.elements;
    var V = Vector.create([S[0] - P[0], S[1] - P[1], S[2] - (P[2] || 0)]);
    var vect = this.toVector();
    return V.isAntiparallelTo(vect) && V.modulus() <= vect.modulus();
  },

  // Returns true iff the line segment intersects the argument
  intersects: function(obj) {
    return (this.intersectionWith(obj) !== null);
  },

  // Returns the unique point of intersection with the argument
  intersectionWith: function(obj) {
    if (!this.line.intersects(obj)) { return null; }
    var P = this.line.intersectionWith(obj);
    return (this.contains(P) ? P : null);
  },

  // Returns the point on the line segment closest to the given object
  pointClosestTo: function(obj) {
    if (obj.normal) {
      // obj is a plane
      var V = this.line.intersectionWith(obj);
      if (V === null) { return null; }
      return this.pointClosestTo(V);
    } else {
      // obj is a line (segment) or point
      var P = this.line.pointClosestTo(obj);
      if (P === null) { return null; }
      if (this.contains(P)) { return P; }
      return (this.line.positionOf(P) < 0 ? this.start : this.end).dup();
    }
  },

  // Set the start and end-points of the segment
  setPoints: function(startPoint, endPoint) {
    startPoint = Vector.create(startPoint).to3D();
    endPoint = Vector.create(endPoint).to3D();
    if (startPoint === null || endPoint === null) { return null; }
    this.line = Line.create(startPoint, endPoint.subtract(startPoint));
    this.start = startPoint;
    this.end = endPoint;
    return this;
  }
};

// Constructor function
Line.Segment.create = function(v1, v2) {
  var S = new Line.Segment();
  return S.setPoints(v1, v2);
};

module.exports = Line.Segment;

},{"./line":13,"./vector":18}],15:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
// Matrix class - depends on Vector.

var Sylvester = require('./sylvester');
var Vector = require('./vector');

// augment a matrix M with identity rows/cols
function identSize(M, m, n, k) {
    var e = M.elements;
    var i = k - 1;

    while(i--) {
	var row = [];
	
	for(var j = 0; j < n; j++)
	    row.push(j == i ? 1 : 0);
	
        e.unshift(row);
    }
    
    for(var i = k - 1; i < m; i++) {
        while(e[i].length < n)
            e[i].unshift(0);
    }

    return $M(e);
}

function pca(X) {
    var Sigma = X.transpose().x(X).x(1 / X.rows());
    var svd = Sigma.svd();
    return {U: svd.U, S: svd.S};
}

// singular value decomposition in pure javascript
function svdJs() {
    var A = this;
    var V = Matrix.I(A.rows());
    var S = A.transpose();
    var U = Matrix.I(A.cols());
    var err = Number.MAX_VALUE;
    var i = 0;
    var maxLoop = 100;

    while(err > 2.2737e-13 && i < maxLoop) {
        var qr = S.transpose().qrJs();
        S = qr.R;
        V = V.x(qr.Q);
        qr = S.transpose().qrJs();
        U = U.x(qr.Q);
        S = qr.R;

        var e = S.triu(1).unroll().norm();
        var f = S.diagonal().norm();

        if(f == 0)
            f = 1;

        err = e / f;

        i++;
    }

    var ss = S.diagonal();
    var s = [];

    for(var i = 1; i <= ss.cols(); i++) {
        var ssn = ss.e(i);
        s.push(Math.abs(ssn));

        if(ssn < 0) {
            for(var j = 0; j < U.rows(); j++) {
                V.elements[j][i - 1] = -(V.elements[j][i - 1]);
            }
        }
    }

    return {U: U, S: $V(s).toDiagonalMatrix(), V: V};
}



// QR decomposition in pure javascript
function qrJs() {
    var m = this.rows();
    var n = this.cols();
    var Q = Matrix.I(m);
    var A = this;
    
    for(var k = 1; k < Math.min(m, n); k++) {
	var ak = A.slice(k, 0, k, k).col(1);
	var oneZero = [1];
	
	while(oneZero.length <=  m - k)
	    oneZero.push(0);
	
	oneZero = $V(oneZero);
	var vk = ak.add(oneZero.x(ak.norm() * Math.sign(ak.e(1))));
	var Vk = $M(vk);
	var Hk = Matrix.I(m - k + 1).subtract(Vk.x(2).x(Vk.transpose()).div(Vk.transpose().x(Vk).e(1, 1)));
	var Qk = identSize(Hk, m, n, k);
	A = Qk.x(A);
	// slow way to compute Q
	Q = Q.x(Qk);
    }
    
    return {Q: Q, R: A};
}




function Matrix() {}
Matrix.prototype = {
    // solve a system of linear equations (work in progress)
    solve: function(b) {
	var lu = this.lu();
	b = lu.P.x(b);
	var y = lu.L.forwardSubstitute(b);
	var x = lu.U.backSubstitute(y);
	return lu.P.x(x);
	//return this.inv().x(b);
    },

    // project a matrix onto a lower dim
    pcaProject: function(k, U) {
	var U = U || pca(this).U;
	var Ureduce= U.slice(1, U.rows(), 1, k);
	return {Z: this.x(Ureduce), U: U};
    },

    // recover a matrix to a higher dimension
    pcaRecover: function(U) {
	var k = this.cols();
	var Ureduce = U.slice(1, U.rows(), 1, k);
	return this.x(Ureduce.transpose());
    },    

    // grab the upper triangular part of the matrix
    triu: function(k) {
	if(!k)
	    k = 0;
	
	return this.map(function(x, i, j) {
	    return j - i >= k ? x : 0;
	});
    },

    // unroll a matrix into a vector
    unroll: function() {
	var v = [];
	
	for(var i = 1; i <= this.cols(); i++) {
	    for(var j = 1; j <= this.rows(); j++) {
		v.push(this.e(j, i));
	    }
	}

	return $V(v);
    },

    // return a sub-block of the matrix
    slice: function(startRow, endRow, startCol, endCol) {
	var x = [];
	
	if(endRow == 0)
	    endRow = this.rows();
	
	if(endCol == 0)
	    endCol = this.cols();

	for(i = startRow; i <= endRow; i++) {
	    var row = [];

	    for(j = startCol; j <= endCol; j++) {
		row.push(this.e(i, j));
	    }

	    x.push(row);
	}

	return $M(x);
    },

    // Returns element (i,j) of the matrix
    e: function(i,j) {
	if (i < 1 || i > this.elements.length || j < 1 || j > this.elements[0].length) { return null; }
	return this.elements[i - 1][j - 1];
    },

    // Returns row k of the matrix as a vector
    row: function(i) {
	if (i > this.elements.length) { return null; }
	return $V(this.elements[i - 1]);
    },

    // Returns column k of the matrix as a vector
    col: function(j) {
	if (j > this.elements[0].length) { return null; }
	var col = [], n = this.elements.length;
	for (var i = 0; i < n; i++) { col.push(this.elements[i][j - 1]); }
	return $V(col);
    },

    // Returns the number of rows/columns the matrix has
    dimensions: function() {
	return {rows: this.elements.length, cols: this.elements[0].length};
    },

    // Returns the number of rows in the matrix
    rows: function() {
	return this.elements.length;
    },

    // Returns the number of columns in the matrix
    cols: function() {
	return this.elements[0].length;
    },

    approxEql: function(matrix) {
	return this.eql(matrix, Sylvester.approxPrecision);
    },

    // Returns true iff the matrix is equal to the argument. You can supply
    // a vector as the argument, in which case the receiver must be a
    // one-column matrix equal to the vector.
    eql: function(matrix, precision) {
	var M = matrix.elements || matrix;
	if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	if (this.elements.length != M.length ||
            this.elements[0].length != M[0].length) { return false; }
	var i = this.elements.length, nj = this.elements[0].length, j;
	while (i--) { j = nj;
		      while (j--) {
			  if (Math.abs(this.elements[i][j] - M[i][j]) > (precision || Sylvester.precision)) { return false; }
		      }
		    }
	return true;
    },

    // Returns a copy of the matrix
    dup: function() {
	return Matrix.create(this.elements);
    },

    // Maps the matrix to another matrix (of the same dimensions) according to the given function
    map: function(fn) {
    var els = [], i = this.elements.length, nj = this.elements[0].length, j;
	while (i--) { j = nj;
		      els[i] = [];
		      while (j--) {
			  els[i][j] = fn(this.elements[i][j], i + 1, j + 1);
		      }
		    }
	return Matrix.create(els);
    },

    // Returns true iff the argument has the same dimensions as the matrix
    isSameSizeAs: function(matrix) {
	var M = matrix.elements || matrix;
	if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	return (this.elements.length == M.length &&
		this.elements[0].length == M[0].length);
    },

    // Returns the result of adding the argument to the matrix
    add: function(matrix) {
	if(typeof(matrix) == 'number') {
	    return this.map(function(x, i, j) { return x + matrix});
	} else {
	    var M = matrix.elements || matrix;
	    if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	    if (!this.isSameSizeAs(M)) { return null; }
	    return this.map(function(x, i, j) { return x + M[i - 1][j - 1]; });
	}
    },

    // Returns the result of subtracting the argument from the matrix
    subtract: function(matrix) {
	if(typeof(matrix) == 'number') {
	    return this.map(function(x, i, j) { return x - matrix});
	} else {
	    var M = matrix.elements || matrix;
	    if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	    if (!this.isSameSizeAs(M)) { return null; }
	    return this.map(function(x, i, j) { return x - M[i - 1][j - 1]; });
	}
    },

    // Returns true iff the matrix can multiply the argument from the left
    canMultiplyFromLeft: function(matrix) {
	var M = matrix.elements || matrix;
	if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	// this.columns should equal matrix.rows
	return (this.elements[0].length == M.length);
    },

    // Returns the result of a multiplication-style operation the matrix from the right by the argument.
    // If the argument is a scalar then just operate on all the elements. If the argument is
    // a vector, a vector is returned, which saves you having to remember calling
    // col(1) on the result.
    mulOp: function(matrix, op) {
	if (!matrix.elements) {
	    return this.map(function(x) { return op(x, matrix); });
	}

	var returnVector = matrix.modulus ? true : false;
	var M = matrix.elements || matrix;
	if (typeof(M[0][0]) == 'undefined') 
	    M = Matrix.create(M).elements;
	if (!this.canMultiplyFromLeft(M)) 
	    return null; 
	var e = this.elements, rowThis, rowElem, elements = [],
        sum, m = e.length, n = M[0].length, o = e[0].length, i = m, j, k;

	while (i--) {
            rowElem = [];
            rowThis = e[i];
            j = n;

            while (j--) {
		sum = 0;
		k = o;

		while (k--) {
                    sum += op(rowThis[k], M[k][j]);
		}

		rowElem[j] = sum;
            }

            elements[i] = rowElem;
	}

	var M = Matrix.create(elements);
	return returnVector ? M.col(1) : M;
    },

    // Returns the result of dividing the matrix from the right by the argument.
    // If the argument is a scalar then just divide all the elements. If the argument is
    // a vector, a vector is returned, which saves you having to remember calling
    // col(1) on the result.
    div: function(matrix) {
	return this.mulOp(matrix, function(x, y) { return x / y});
    },

    // Returns the result of multiplying the matrix from the right by the argument.
    // If the argument is a scalar then just multiply all the elements. If the argument is
    // a vector, a vector is returned, which saves you having to remember calling
    // col(1) on the result.
    multiply: function(matrix) {
	return this.mulOp(matrix, function(x, y) { return x * y});
    },

    x: function(matrix) { return this.multiply(matrix); },

    elementMultiply: function(v) {
        return this.map(function(k, i, j) {
            return v.e(i, j) * k;
        });
    },

    // sum all elements in the matrix
    sum: function() {
        var sum = 0;

        this.map(function(x) { sum += x;});

        return sum;
    },

    // Returns a Vector of each colum averaged.
    mean: function() {
      var dim = this.dimensions();
      var r = [];
      for (var i = 1; i <= dim.cols; i++) {
        r.push(this.col(i).sum() / dim.rows);
      }
      return $V(r);
    },

    column: function(n) {
	return this.col(n);
    },

    // element-wise log
    log: function() {
	return this.map(function(x) { return Math.log(x); });
    },

    // Returns a submatrix taken from the matrix
    // Argument order is: start row, start col, nrows, ncols
    // Element selection wraps if the required index is outside the matrix's bounds, so you could
    // use this to perform row/column cycling or copy-augmenting.
    minor: function(a, b, c, d) {
	var elements = [], ni = c, i, nj, j;
	var rows = this.elements.length, cols = this.elements[0].length;
	while (ni--) {
	    i = c - ni - 1;
	    elements[i] = [];
	    nj = d;
	    while (nj--) {
		j = d - nj - 1;
		elements[i][j] = this.elements[(a + i - 1) % rows][(b + j - 1) % cols];
	    }
	}
	return Matrix.create(elements);
    },

    // Returns the transpose of the matrix
    transpose: function() {
    var rows = this.elements.length, i, cols = this.elements[0].length, j;
	var elements = [], i = cols;
	while (i--) {
	    j = rows;
	    elements[i] = [];
	    while (j--) {
		elements[i][j] = this.elements[j][i];
	    }
	}
	return Matrix.create(elements);
    },

    // Returns true iff the matrix is square
    isSquare: function() {
	return (this.elements.length == this.elements[0].length);
    },

    // Returns the (absolute) largest element of the matrix
    max: function() {
	var m = 0, i = this.elements.length, nj = this.elements[0].length, j;
	while (i--) {
	    j = nj;
	    while (j--) {
		if (Math.abs(this.elements[i][j]) > Math.abs(m)) { m = this.elements[i][j]; }
	    }
	}
	return m;
    },

    // Returns the indeces of the first match found by reading row-by-row from left to right
    indexOf: function(x) {
	var index = null, ni = this.elements.length, i, nj = this.elements[0].length, j;
	for (i = 0; i < ni; i++) {
	    for (j = 0; j < nj; j++) {
		if (this.elements[i][j] == x) { return {i: i + 1, j: j + 1}; }
	    }
	}
	return null;
    },

    // If the matrix is square, returns the diagonal elements as a vector.
    // Otherwise, returns null.
    diagonal: function() {
	if (!this.isSquare) { return null; }
	var els = [], n = this.elements.length;
	for (var i = 0; i < n; i++) {
	    els.push(this.elements[i][i]);
	}
	return $V(els);
    },

    // Make the matrix upper (right) triangular by Gaussian elimination.
    // This method only adds multiples of rows to other rows. No rows are
    // scaled up or switched, and the determinant is preserved.
    toRightTriangular: function() {
	var M = this.dup(), els;
	var n = this.elements.length, i, j, np = this.elements[0].length, p;
	for (i = 0; i < n; i++) {
	    if (M.elements[i][i] == 0) {
		for (j = i + 1; j < n; j++) {
		    if (M.elements[j][i] != 0) {
			els = [];
			for (p = 0; p < np; p++) { els.push(M.elements[i][p] + M.elements[j][p]); }
			M.elements[i] = els;
			break;
		    }
		}
	    }
	    if (M.elements[i][i] != 0) {
		for (j = i + 1; j < n; j++) {
		    var multiplier = M.elements[j][i] / M.elements[i][i];
		    els = [];
		    for (p = 0; p < np; p++) {
			// Elements with column numbers up to an including the number
			// of the row that we're subtracting can safely be set straight to
			// zero, since that's the point of this routine and it avoids having
			// to loop over and correct rounding errors later
			els.push(p <= i ? 0 : M.elements[j][p] - M.elements[i][p] * multiplier);
		    }
		    M.elements[j] = els;
		}
	    }
	}
	return M;
    },

    toUpperTriangular: function() { return this.toRightTriangular(); },

    // Returns the determinant for square matrices
    determinant: function() {
	if (!this.isSquare()) { return null; }
	if (this.cols == 1 && this.rows == 1) { return this.row(1); }
	if (this.cols == 0 && this.rows == 0) { return 1; }
	var M = this.toRightTriangular();
	var det = M.elements[0][0], n = M.elements.length;
	for (var i = 1; i < n; i++) {
	    det = det * M.elements[i][i];
	}
	return det;
    },
    det: function() { return this.determinant(); },

    // Returns true iff the matrix is singular
    isSingular: function() {
	return (this.isSquare() && this.determinant() === 0);
    },

    // Returns the trace for square matrices
    trace: function() {
	if (!this.isSquare()) { return null; }
	var tr = this.elements[0][0], n = this.elements.length;
	for (var i = 1; i < n; i++) {
	    tr += this.elements[i][i];
	}
	return tr;
    },

    tr: function() { return this.trace(); },

    // Returns the rank of the matrix
    rank: function() {
	var M = this.toRightTriangular(), rank = 0;
	var i = this.elements.length, nj = this.elements[0].length, j;
	while (i--) {
	    j = nj;
	    while (j--) {
		if (Math.abs(M.elements[i][j]) > Sylvester.precision) { rank++; break; }
	    }
	}
	return rank;
    },

    rk: function() { return this.rank(); },

    // Returns the result of attaching the given argument to the right-hand side of the matrix
    augment: function(matrix) {
	var M = matrix.elements || matrix;
	if (typeof(M[0][0]) == 'undefined') { M = Matrix.create(M).elements; }
	var T = this.dup(), cols = T.elements[0].length;
	var i = T.elements.length, nj = M[0].length, j;
	if (i != M.length) { return null; }
	while (i--) {
	    j = nj;
	    while (j--) {
		T.elements[i][cols + j] = M[i][j];
	    }
	}
	return T;
    },

    // Returns the inverse (if one exists) using Gauss-Jordan
    inverse: function() {
	if (!this.isSquare() || this.isSingular()) { return null; }
	var n = this.elements.length, i = n, j;
	var M = this.augment(Matrix.I(n)).toRightTriangular();
	var np = M.elements[0].length, p, els, divisor;
	var inverse_elements = [], new_element;
	// Matrix is non-singular so there will be no zeros on the diagonal
	// Cycle through rows from last to first
	while (i--) {
	    // First, normalise diagonal elements to 1
	    els = [];
	    inverse_elements[i] = [];
	    divisor = M.elements[i][i];
	    for (p = 0; p < np; p++) {
        new_element = M.elements[i][p] / divisor;
		els.push(new_element);
		// Shuffle off the current row of the right hand side into the results
		// array as it will not be modified by later runs through this loop
		if (p >= n) { inverse_elements[i].push(new_element); }
	    }
	    M.elements[i] = els;
	    // Then, subtract this row from those above it to
	    // give the identity matrix on the left hand side
	    j = i;
	    while (j--) {
		els = [];
		for (p = 0; p < np; p++) {
		    els.push(M.elements[j][p] - M.elements[i][p] * M.elements[j][i]);
		}
		M.elements[j] = els;
	    }
	}
	return Matrix.create(inverse_elements);
    },

    inv: function() { return this.inverse(); },

    // Returns the result of rounding all the elements
    round: function() {
	return this.map(function(x) { return Math.round(x); });
    },

    // Returns a copy of the matrix with elements set to the given value if they
    // differ from it by less than Sylvester.precision
    snapTo: function(x) {
	return this.map(function(p) {
	    return (Math.abs(p - x) <= Sylvester.precision) ? x : p;
	});
    },

    // Returns a string representation of the matrix
    inspect: function() {
	var matrix_rows = [];
	var n = this.elements.length;
	for (var i = 0; i < n; i++) {
	    matrix_rows.push($V(this.elements[i]).inspect());
	}
	return matrix_rows.join('\n');
    },

    // Returns a array representation of the matrix
    toArray: function() {
    	var matrix_rows = [];
    	var n = this.elements.length;
    	for (var i = 0; i < n; i++) {
        matrix_rows.push(this.elements[i]);
    	}
      return matrix_rows;
    },


    // Set the matrix's elements from an array. If the argument passed
    // is a vector, the resulting matrix will be a single column.
    setElements: function(els) {
	var i, j, elements = els.elements || els;
	if (typeof(elements[0][0]) != 'undefined') {
	    i = elements.length;
	    this.elements = [];
	    while (i--) {
		j = elements[i].length;
		this.elements[i] = [];
		while (j--) {
		    this.elements[i][j] = elements[i][j];
		}
	    }
	    return this;
	}
	var n = elements.length;
	this.elements = [];
	for (i = 0; i < n; i++) {
	    this.elements.push([elements[i]]);
	}
	return this;
    },

    // return the indexes of the columns with the largest value
    // for each row
    maxColumnIndexes: function() {
	var maxes = [];

	for(var i = 1; i <= this.rows(); i++) {
	    var max = null;
	    var maxIndex = -1;

	    for(var j = 1; j <= this.cols(); j++) {
		if(max === null || this.e(i, j) > max) {
		    max = this.e(i, j);
		    maxIndex = j;
		}
	    }

	    maxes.push(maxIndex);
	}

	return $V(maxes);
    },

    // return the largest values in each row
    maxColumns: function() {
	var maxes = [];

	for(var i = 1; i <= this.rows(); i++) {
	    var max = null;

	    for(var j = 1; j <= this.cols(); j++) {
		if(max === null || this.e(i, j) > max) {
		    max = this.e(i, j);
		}
	    }

	    maxes.push(max);
	}

	return $V(maxes);
    },

    // return the indexes of the columns with the smallest values
    // for each row
    minColumnIndexes: function() {
	var mins = [];

	for(var i = 1; i <= this.rows(); i++) {
	    var min = null;
	    var minIndex = -1;

	    for(var j = 1; j <= this.cols(); j++) {
		if(min === null || this.e(i, j) < min) {
		    min = this.e(i, j);
		    minIndex = j;
		}
	    }

	    mins.push(minIndex);
	}

	return $V(mins);
    },

    // return the smallest values in each row
    minColumns: function() {
	var mins = [];

	for(var i = 1; i <= this.rows(); i++) {
	    var min = null;

	    for(var j = 1; j <= this.cols(); j++) {
		if(min === null || this.e(i, j) < min) {
		    min = this.e(i, j);
		}
	    }

	    mins.push(min);
	}

	return $V(mins);
    },
    
    // perorm a partial pivot on the matrix. essentially move the largest
    // row below-or-including the pivot and replace the pivot's row with it.
    // a pivot matrix is returned so multiplication can perform the transform.
    partialPivot: function(k, j, P, A, L) {
	var maxIndex = 0;
	var maxValue = 0;

	for(var i = k; i <= A.rows(); i++) {
	    if(Math.abs(A.e(i, j)) > maxValue) {
		maxValue = Math.abs(A.e(k, j));
		maxIndex = i;
	    }
	}

	if(maxIndex != k) {
	    var tmp = A.elements[k - 1];
	    A.elements[k - 1] = A.elements[maxIndex - 1];
	    A.elements[maxIndex - 1] = tmp;
	    
	    P.elements[k - 1][k - 1] = 0;
	    P.elements[k - 1][maxIndex - 1] = 1;
	    P.elements[maxIndex - 1][maxIndex - 1] = 0;
	    P.elements[maxIndex - 1][k - 1] = 1;
	}
	
	return P;
    },

    // solve lower-triangular matrix * x = b via forward substitution
    forwardSubstitute: function(b) {
	var xa = [];

	for(var i = 1; i <= this.rows(); i++) {
	    var w = 0;

	    for(var j = 1; j < i; j++) {
		w += this.e(i, j) * xa[j - 1];
	    }

	    xa.push((b.e(i) - w) / this.e(i, i));
	}

	return $V(xa);
    },

    // solve an upper-triangular matrix * x = b via back substitution
    backSubstitute: function(b) {
	var xa = [];

	for(var i = this.rows(); i > 0; i--) {
	    var w = 0;

	    for(var j = this.cols(); j > i; j--) {
		w += this.e(i, j) * xa[this.rows() - j];
	    }

	    xa.push((b.e(i) - w) / this.e(i, i));
	}

	return $V(xa.reverse());
    },
    
    luJs: luJs,
    svdJs: svdJs,
    qrJs: qrJs,
};


var tolerance =  1.4901e-08;

// pure Javascript LU factorization
function luJs() {
    var A = this.dup();
    var L = Matrix.I(A.rows());
    var P = Matrix.I(A.rows());
    var U = Matrix.Zeros(A.rows(), A.cols());
    var p = 1;

    for(var k = 1; k <= Math.min(A.cols(), A.rows()); k++) {
	P = A.partialPivot(k, p, P, A, L);
	
	for(var i = k + 1; i <= A.rows(); i++) {
	    var l = A.e(i, p) / A.e(k, p);
	    L.elements[i - 1][k - 1] = l;
	    
	    for(var j = k + 1 ; j <= A.cols(); j++) {
		A.elements[i - 1][j - 1] -= A.e(k, j) * l;
	    }
	}
	
	for(var j = k; j <= A.cols(); j++) {
	    U.elements[k - 1][j - 1] = A.e(k, j);
	}

	if(p < A.cols())
	    p++;
    }    
    
    return {L: L, U: U, P: P};
}



Matrix.prototype.svd = svdJs;
Matrix.prototype.qr = qrJs;
Matrix.prototype.lu = luJs;

// Constructor function
Matrix.create = function(aElements) {
    var M = new Matrix().setElements(aElements);
    return M;
};

// Identity matrix of size n
Matrix.I = function(n) {
    var els = [], i = n, j;
    while (i--) {
	j = n;
	els[i] = [];
	while (j--) {
	    els[i][j] = (i == j) ? 1 : 0;
	}
    }
    return Matrix.create(els);
};

Matrix.loadFile = function(file) {
    var fs = require('fs');
    var contents = fs.readFileSync(file, 'utf-8');
    var matrix = [];

    var rowArray = contents.split('\n');
    for (var i = 0; i < rowArray.length; i++) {
	var d = rowArray[i].split(',');
	if (d.length > 1) {
	    matrix.push(d);
	}
    }

    var M = new Matrix();
    return M.setElements(matrix);
};

// Diagonal matrix - all off-diagonal elements are zero
Matrix.Diagonal = function(elements) {
    var i = elements.length;
    var M = Matrix.I(i);
    while (i--) {
	M.elements[i][i] = elements[i];
    }
    return M;
};

// Rotation matrix about some axis. If no axis is
// supplied, assume we're after a 2D transform
Matrix.Rotation = function(theta, a) {
    if (!a) {
	return Matrix.create([
	    [Math.cos(theta), -Math.sin(theta)],
	    [Math.sin(theta), Math.cos(theta)]
	]);
    }
    var axis = a.dup();
    if (axis.elements.length != 3) { return null; }
    var mod = axis.modulus();
    var x = axis.elements[0] / mod, y = axis.elements[1] / mod, z = axis.elements[2] / mod;
    var s = Math.sin(theta), c = Math.cos(theta), t = 1 - c;
    // Formula derived here: http://www.gamedev.net/reference/articles/article1199.asp
    // That proof rotates the co-ordinate system so theta
    // becomes -theta and sin becomes -sin here.
    return Matrix.create([
	[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
	[t * x * y + s * z, t * y * y + c, t * y * z - s * x],
	[t * x * z - s * y, t * y * z + s * x, t * z * z + c]
    ]);
};

// Special case rotations
Matrix.RotationX = function(t) {
    var c = Math.cos(t), s = Math.sin(t);
    return Matrix.create([
	[1, 0, 0],
	[0, c, -s],
	[0, s, c]
    ]);
};

Matrix.RotationY = function(t) {
    var c = Math.cos(t), s = Math.sin(t);
    return Matrix.create([
	[c, 0, s],
	[0, 1, 0],
	[-s, 0, c]
    ]);
};

Matrix.RotationZ = function(t) {
    var c = Math.cos(t), s = Math.sin(t);
    return Matrix.create([
	[c, -s, 0],
	[s, c, 0],
	[0, 0, 1]
    ]);
};

// Random matrix of n rows, m columns
Matrix.Random = function(n, m) {
    if (arguments.length === 1) m = n;
    return Matrix.Zero(n, m).map(
	function() { return Math.random(); }
  );
};

Matrix.Fill = function(n, m, v) {
    if (arguments.length === 2) {
	v = m;
	m = n;
    }

    var els = [], i = n, j;

    while (i--) {
	j = m;
	els[i] = [];

	while (j--) {
	    els[i][j] = v;
	}
    }

    return Matrix.create(els);
};

// Matrix filled with zeros
Matrix.Zero = function(n, m) {
    return Matrix.Fill(n, m, 0);
};

// Matrix filled with zeros
Matrix.Zeros = function(n, m) {
    return Matrix.Zero(n, m);
};

// Matrix filled with ones
Matrix.One = function(n, m) {
    return Matrix.Fill(n, m, 1);
};

// Matrix filled with ones
Matrix.Ones = function(n, m) {
    return Matrix.One(n, m);
};

module.exports = Matrix;

},{"./sylvester":17,"./vector":18,"fs":undefined}],16:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
// Plane class - depends on Vector. Some methods require Matrix and Line.
var Vector = require('./vector');
var Matrix = require('./matrix');
var Line = require('./line');

var Sylvester = require('./sylvester');

function Plane() {}
Plane.prototype = {

  // Returns true iff the plane occupies the same space as the argument
  eql: function(plane) {
    return (this.contains(plane.anchor) && this.isParallelTo(plane));
  },

  // Returns a copy of the plane
  dup: function() {
    return Plane.create(this.anchor, this.normal);
  },

  // Returns the result of translating the plane by the given vector
  translate: function(vector) {
    var V = vector.elements || vector;
    return Plane.create([
      this.anchor.elements[0] + V[0],
      this.anchor.elements[1] + V[1],
      this.anchor.elements[2] + (V[2] || 0)
    ], this.normal);
  },

  // Returns true iff the plane is parallel to the argument. Will return true
  // if the planes are equal, or if you give a line and it lies in the plane.
  isParallelTo: function(obj) {
    var theta;
    if (obj.normal) {
      // obj is a plane
      theta = this.normal.angleFrom(obj.normal);
      return (Math.abs(theta) <= Sylvester.precision || Math.abs(Math.PI - theta) <= Sylvester.precision);
    } else if (obj.direction) {
      // obj is a line
      return this.normal.isPerpendicularTo(obj.direction);
    }
    return null;
  },

  // Returns true iff the receiver is perpendicular to the argument
  isPerpendicularTo: function(plane) {
    var theta = this.normal.angleFrom(plane.normal);
    return (Math.abs(Math.PI/2 - theta) <= Sylvester.precision);
  },

  // Returns the plane's distance from the given object (point, line or plane)
  distanceFrom: function(obj) {
    if (this.intersects(obj) || this.contains(obj)) { return 0; }
    if (obj.anchor) {
      // obj is a plane or line
      var A = this.anchor.elements, B = obj.anchor.elements, N = this.normal.elements;
      return Math.abs((A[0] - B[0]) * N[0] + (A[1] - B[1]) * N[1] + (A[2] - B[2]) * N[2]);
    } else {
      // obj is a point
      var P = obj.elements || obj;
      var A = this.anchor.elements, N = this.normal.elements;
      return Math.abs((A[0] - P[0]) * N[0] + (A[1] - P[1]) * N[1] + (A[2] - (P[2] || 0)) * N[2]);
    }
  },

  // Returns true iff the plane contains the given point or line
  contains: function(obj) {
    if (obj.normal) { return null; }
    if (obj.direction) {
      return (this.contains(obj.anchor) && this.contains(obj.anchor.add(obj.direction)));
    } else {
      var P = obj.elements || obj;
      var A = this.anchor.elements, N = this.normal.elements;
      var diff = Math.abs(N[0]*(A[0] - P[0]) + N[1]*(A[1] - P[1]) + N[2]*(A[2] - (P[2] || 0)));
      return (diff <= Sylvester.precision);
    }
  },

  // Returns true iff the plane has a unique point/line of intersection with the argument
  intersects: function(obj) {
    if (typeof(obj.direction) == 'undefined' && typeof(obj.normal) == 'undefined') { return null; }
    return !this.isParallelTo(obj);
  },

  // Returns the unique intersection with the argument, if one exists. The result
  // will be a vector if a line is supplied, and a line if a plane is supplied.
  intersectionWith: function(obj) {
    if (!this.intersects(obj)) { return null; }
    if (obj.direction) {
      // obj is a line
      var A = obj.anchor.elements, D = obj.direction.elements,
          P = this.anchor.elements, N = this.normal.elements;
      var multiplier = (N[0]*(P[0]-A[0]) + N[1]*(P[1]-A[1]) + N[2]*(P[2]-A[2])) / (N[0]*D[0] + N[1]*D[1] + N[2]*D[2]);
      return Vector.create([A[0] + D[0]*multiplier, A[1] + D[1]*multiplier, A[2] + D[2]*multiplier]);
    } else if (obj.normal) {
      // obj is a plane
      var direction = this.normal.cross(obj.normal).toUnitVector();
      // To find an anchor point, we find one co-ordinate that has a value
      // of zero somewhere on the intersection, and remember which one we picked
      var N = this.normal.elements, A = this.anchor.elements,
          O = obj.normal.elements, B = obj.anchor.elements;
      var solver = Matrix.Zero(2,2), i = 0;
      while (solver.isSingular()) {
        i++;
        solver = Matrix.create([
          [ N[i%3], N[(i+1)%3] ],
          [ O[i%3], O[(i+1)%3]  ]
        ]);
      }
      // Then we solve the simultaneous equations in the remaining dimensions
      var inverse = solver.inverse().elements;
      var x = N[0]*A[0] + N[1]*A[1] + N[2]*A[2];
      var y = O[0]*B[0] + O[1]*B[1] + O[2]*B[2];
      var intersection = [
        inverse[0][0] * x + inverse[0][1] * y,
        inverse[1][0] * x + inverse[1][1] * y
      ];
      var anchor = [];
      for (var j = 1; j <= 3; j++) {
        // This formula picks the right element from intersection by
        // cycling depending on which element we set to zero above
        anchor.push((i == j) ? 0 : intersection[(j + (5 - i)%3)%3]);
      }
      return Line.create(anchor, direction);
    }
  },

  // Returns the point in the plane closest to the given point
  pointClosestTo: function(point) {
    var P = point.elements || point;
    var A = this.anchor.elements, N = this.normal.elements;
    var dot = (A[0] - P[0]) * N[0] + (A[1] - P[1]) * N[1] + (A[2] - (P[2] || 0)) * N[2];
    return Vector.create([P[0] + N[0] * dot, P[1] + N[1] * dot, (P[2] || 0) + N[2] * dot]);
  },

  // Returns a copy of the plane, rotated by t radians about the given line
  // See notes on Line#rotate.
  rotate: function(t, line) {
    var R = t.determinant ? t.elements : Matrix.Rotation(t, line.direction).elements;
    var C = line.pointClosestTo(this.anchor).elements;
    var A = this.anchor.elements, N = this.normal.elements;
    var C1 = C[0], C2 = C[1], C3 = C[2], A1 = A[0], A2 = A[1], A3 = A[2];
    var x = A1 - C1, y = A2 - C2, z = A3 - C3;
    return Plane.create([
      C1 + R[0][0] * x + R[0][1] * y + R[0][2] * z,
      C2 + R[1][0] * x + R[1][1] * y + R[1][2] * z,
      C3 + R[2][0] * x + R[2][1] * y + R[2][2] * z
    ], [
      R[0][0] * N[0] + R[0][1] * N[1] + R[0][2] * N[2],
      R[1][0] * N[0] + R[1][1] * N[1] + R[1][2] * N[2],
      R[2][0] * N[0] + R[2][1] * N[1] + R[2][2] * N[2]
    ]);
  },

  // Returns the reflection of the plane in the given point, line or plane.
  reflectionIn: function(obj) {
    if (obj.normal) {
      // obj is a plane
      var A = this.anchor.elements, N = this.normal.elements;
      var A1 = A[0], A2 = A[1], A3 = A[2], N1 = N[0], N2 = N[1], N3 = N[2];
      var newA = this.anchor.reflectionIn(obj).elements;
      // Add the plane's normal to its anchor, then mirror that in the other plane
      var AN1 = A1 + N1, AN2 = A2 + N2, AN3 = A3 + N3;
      var Q = obj.pointClosestTo([AN1, AN2, AN3]).elements;
      var newN = [Q[0] + (Q[0] - AN1) - newA[0], Q[1] + (Q[1] - AN2) - newA[1], Q[2] + (Q[2] - AN3) - newA[2]];
      return Plane.create(newA, newN);
    } else if (obj.direction) {
      // obj is a line
      return this.rotate(Math.PI, obj);
    } else {
      // obj is a point
      var P = obj.elements || obj;
      return Plane.create(this.anchor.reflectionIn([P[0], P[1], (P[2] || 0)]), this.normal);
    }
  },

  // Sets the anchor point and normal to the plane. If three arguments are specified,
  // the normal is calculated by assuming the three points should lie in the same plane.
  // If only two are sepcified, the second is taken to be the normal. Normal vector is
  // normalised before storage.
  setVectors: function(anchor, v1, v2) {
    anchor = Vector.create(anchor);
    anchor = anchor.to3D(); if (anchor === null) { return null; }
    v1 = Vector.create(v1);
    v1 = v1.to3D(); if (v1 === null) { return null; }
    if (typeof(v2) == 'undefined') {
      v2 = null;
    } else {
      v2 = Vector.create(v2);
      v2 = v2.to3D(); if (v2 === null) { return null; }
    }
    var A1 = anchor.elements[0], A2 = anchor.elements[1], A3 = anchor.elements[2];
    var v11 = v1.elements[0], v12 = v1.elements[1], v13 = v1.elements[2];
    var normal, mod;
    if (v2 !== null) {
      var v21 = v2.elements[0], v22 = v2.elements[1], v23 = v2.elements[2];
      normal = Vector.create([
        (v12 - A2) * (v23 - A3) - (v13 - A3) * (v22 - A2),
        (v13 - A3) * (v21 - A1) - (v11 - A1) * (v23 - A3),
        (v11 - A1) * (v22 - A2) - (v12 - A2) * (v21 - A1)
      ]);
      mod = normal.modulus();
      if (mod === 0) { return null; }
      normal = Vector.create([normal.elements[0] / mod, normal.elements[1] / mod, normal.elements[2] / mod]);
    } else {
      mod = Math.sqrt(v11*v11 + v12*v12 + v13*v13);
      if (mod === 0) { return null; }
      normal = Vector.create([v1.elements[0] / mod, v1.elements[1] / mod, v1.elements[2] / mod]);
    }
    this.anchor = anchor;
    this.normal = normal;
    return this;
  }
};

// Constructor function
Plane.create = function(anchor, v1, v2) {
  var P = new Plane();
  return P.setVectors(anchor, v1, v2);
};

// X-Y-Z planes
Plane.XY = Plane.create(Vector.Zero(3), Vector.k);
Plane.YZ = Plane.create(Vector.Zero(3), Vector.i);
Plane.ZX = Plane.create(Vector.Zero(3), Vector.j);
Plane.YX = Plane.XY; Plane.ZY = Plane.YZ; Plane.XZ = Plane.ZX;

// Returns the plane containing the given points (can be arrays as
// well as vectors). If the points are not coplanar, returns null.
Plane.fromPoints = function(points) {
  var np = points.length, list = [], i, P, n, N, A, B, C, D, theta, prevN, totalN = Vector.Zero(3);
  for (i = 0; i < np; i++) {
    P = Vector.create(points[i]).to3D();
    if (P === null) { return null; }
    list.push(P);
    n = list.length;
    if (n > 2) {
      // Compute plane normal for the latest three points
      A = list[n-1].elements; B = list[n-2].elements; C = list[n-3].elements;
      N = Vector.create([
        (A[1] - B[1]) * (C[2] - B[2]) - (A[2] - B[2]) * (C[1] - B[1]),
        (A[2] - B[2]) * (C[0] - B[0]) - (A[0] - B[0]) * (C[2] - B[2]),
        (A[0] - B[0]) * (C[1] - B[1]) - (A[1] - B[1]) * (C[0] - B[0])
      ]).toUnitVector();
      if (n > 3) {
        // If the latest normal is not (anti)parallel to the previous one, we've strayed off the plane.
        // This might be a slightly long-winded way of doing things, but we need the sum of all the normals
        // to find which way the plane normal should point so that the points form an anticlockwise list.
        theta = N.angleFrom(prevN);
        if (theta !== null) {
          if (!(Math.abs(theta) <= Sylvester.precision || Math.abs(theta - Math.PI) <= Sylvester.precision)) { return null; }
        }
      }
      totalN = totalN.add(N);
      prevN = N;
    }
  }
  // We need to add in the normals at the start and end points, which the above misses out
  A = list[1].elements; B = list[0].elements; C = list[n-1].elements; D = list[n-2].elements;
  totalN = totalN.add(Vector.create([
    (A[1] - B[1]) * (C[2] - B[2]) - (A[2] - B[2]) * (C[1] - B[1]),
    (A[2] - B[2]) * (C[0] - B[0]) - (A[0] - B[0]) * (C[2] - B[2]),
    (A[0] - B[0]) * (C[1] - B[1]) - (A[1] - B[1]) * (C[0] - B[0])
  ]).toUnitVector()).add(Vector.create([
    (B[1] - C[1]) * (D[2] - C[2]) - (B[2] - C[2]) * (D[1] - C[1]),
    (B[2] - C[2]) * (D[0] - C[0]) - (B[0] - C[0]) * (D[2] - C[2]),
    (B[0] - C[0]) * (D[1] - C[1]) - (B[1] - C[1]) * (D[0] - C[0])
  ]).toUnitVector());
  return Plane.create(list[0], totalN);
};

module.exports = Plane;

},{"./line":13,"./matrix":15,"./sylvester":17,"./vector":18}],17:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
// This file is required in order for any other classes to work. Some Vector methods work with the
// other Sylvester classes and are useless unless they are included. Other classes such as Line and
// Plane will not function at all without Vector being loaded first.           

Math.sign = function(x) {
    return x < 0 ? -1: 1;
}
                                              
var Sylvester = {
    precision: 1e-6,
    approxPrecision: 1e-5
};

module.exports = Sylvester;

},{}],18:[function(require,module,exports){
// Copyright (c) 2011, Chris Umbel, James Coglan
// This file is required in order for any other classes to work. Some Vector methods work with the
// other Sylvester classes and are useless unless they are included. Other classes such as Line and
// Plane will not function at all without Vector being loaded first.

var Sylvester = require('./sylvester'),
Matrix = require('./matrix');

function Vector() {}
Vector.prototype = {

    norm: function() {
	var n = this.elements.length;
	var sum = 0;

	while (n--) {
	    sum += Math.pow(this.elements[n], 2);
	}

	return Math.sqrt(sum);
    },

    // Returns element i of the vector
    e: function(i) {
      return (i < 1 || i > this.elements.length) ? null : this.elements[i - 1];
    },

    // Returns the number of rows/columns the vector has
    dimensions: function() {
      return {rows: 1, cols: this.elements.length};
    },

    // Returns the number of rows in the vector
    rows: function() {
      return 1;
    },

    // Returns the number of columns in the vector
    cols: function() {
      return this.elements.length;
    },

    // Returns the modulus ('length') of the vector
    modulus: function() {
      return Math.sqrt(this.dot(this));
    },

    // Returns true iff the vector is equal to the argument
    eql: function(vector) {
    	var n = this.elements.length;
    	var V = vector.elements || vector;
    	if (n != V.length) { return false; }
    	while (n--) {
    	    if (Math.abs(this.elements[n] - V[n]) > Sylvester.precision) { return false; }
    	}
    	return true;
    },

    // Returns a copy of the vector
    dup: function() {
	    return Vector.create(this.elements);
    },

    // Maps the vector to another vector according to the given function
    map: function(fn) {
	var elements = [];
	this.each(function(x, i) {
	    elements.push(fn(x, i));
	});
	return Vector.create(elements);
    },

    // Calls the iterator for each element of the vector in turn
    each: function(fn) {
	var n = this.elements.length;
	for (var i = 0; i < n; i++) {
	    fn(this.elements[i], i + 1);
	}
    },

    // Returns a new vector created by normalizing the receiver
    toUnitVector: function() {
	var r = this.modulus();
	if (r === 0) { return this.dup(); }
	return this.map(function(x) { return x / r; });
    },

    // Returns the angle between the vector and the argument (also a vector)
    angleFrom: function(vector) {
	var V = vector.elements || vector;
	var n = this.elements.length, k = n, i;
	if (n != V.length) { return null; }
	var dot = 0, mod1 = 0, mod2 = 0;
	// Work things out in parallel to save time
	this.each(function(x, i) {
	    dot += x * V[i - 1];
	    mod1 += x * x;
	    mod2 += V[i - 1] * V[i - 1];
	});
	mod1 = Math.sqrt(mod1); mod2 = Math.sqrt(mod2);
	if (mod1 * mod2 === 0) { return null; }
	var theta = dot / (mod1 * mod2);
	if (theta < -1) { theta = -1; }
	if (theta > 1) { theta = 1; }
	return Math.acos(theta);
    },

    // Returns true iff the vector is parallel to the argument
    isParallelTo: function(vector) {
	var angle = this.angleFrom(vector);
	return (angle === null) ? null : (angle <= Sylvester.precision);
    },

    // Returns true iff the vector is antiparallel to the argument
    isAntiparallelTo: function(vector) {
	var angle = this.angleFrom(vector);
	return (angle === null) ? null : (Math.abs(angle - Math.PI) <= Sylvester.precision);
    },

    // Returns true iff the vector is perpendicular to the argument
    isPerpendicularTo: function(vector) {
	var dot = this.dot(vector);
	return (dot === null) ? null : (Math.abs(dot) <= Sylvester.precision);
    },

    // Returns the result of adding the argument to the vector
    add: function(value) {
	var V = value.elements || value;

	if (this.elements.length != V.length) 
	    return this.map(function(v) { return v + value });
	else
	    return this.map(function(x, i) { return x + V[i - 1]; });
    },

    // Returns the result of subtracting the argument from the vector
    subtract: function(v) {
	if (typeof(v) == 'number')
	    return this.map(function(k) { return k - v; });

	var V = v.elements || v;
	if (this.elements.length != V.length) { return null; }
	return this.map(function(x, i) { return x - V[i - 1]; });
    },

    // Returns the result of multiplying the elements of the vector by the argument
    multiply: function(k) {
	return this.map(function(x) { return x * k; });
    },

    elementMultiply: function(v) {
	return this.map(function(k, i) {
	    return v.e(i) * k;
	});
    },

    sum: function() {
	var sum = 0;
	this.map(function(x) { sum += x;});
	return sum;
    },

    chomp: function(n) {
	var elements = [];

	for (var i = n; i < this.elements.length; i++) {
	    elements.push(this.elements[i]);
	}

	return Vector.create(elements);
    },

    top: function(n) {
	var elements = [];

	for (var i = 0; i < n; i++) {
	    elements.push(this.elements[i]);
	}

	return Vector.create(elements);
    },

    augment: function(elements) {
	var newElements = this.elements;

	for (var i = 0; i < elements.length; i++) {
	    newElements.push(elements[i]);
	}

	return Vector.create(newElements);
    },

    x: function(k) { return this.multiply(k); },

    log: function() {
	return Vector.log(this);
    },

    elementDivide: function(vector) {
	return this.map(function(v, i) {
	    return v / vector.e(i);
	});
    },

    product: function() {
	var p = 1;

	this.map(function(v) {
	    p *= v;
	});

	return p;
    },

    // Returns the scalar product of the vector with the argument
    // Both vectors must have equal dimensionality
    dot: function(vector) {
	var V = vector.elements || vector;
	var i, product = 0, n = this.elements.length;	
	if (n != V.length) { return null; }
	while (n--) { product += this.elements[n] * V[n]; }
	return product;
    },

    // Returns the vector product of the vector with the argument
    // Both vectors must have dimensionality 3
    cross: function(vector) {
	var B = vector.elements || vector;
	if (this.elements.length != 3 || B.length != 3) { return null; }
	var A = this.elements;
	return Vector.create([
	    (A[1] * B[2]) - (A[2] * B[1]),
	    (A[2] * B[0]) - (A[0] * B[2]),
	    (A[0] * B[1]) - (A[1] * B[0])
	]);
    },

    // Returns the (absolute) largest element of the vector
    max: function() {
	var m = 0, i = this.elements.length;
	while (i--) {
	    if (Math.abs(this.elements[i]) > Math.abs(m)) { m = this.elements[i]; }
	}
	return m;
    },


    maxIndex: function() {
	var m = 0, i = this.elements.length;
	var maxIndex = -1;

	while (i--) {
	    if (Math.abs(this.elements[i]) > Math.abs(m)) { 
		m = this.elements[i]; 
		maxIndex = i + 1;
	    }
	}

	return maxIndex;
    },


    // Returns the index of the first match found
    indexOf: function(x) {
	var index = null, n = this.elements.length;
	for (var i = 0; i < n; i++) {
	    if (index === null && this.elements[i] == x) {
		index = i + 1;
	    }
	}
	return index;
    },

    // Returns a diagonal matrix with the vector's elements as its diagonal elements
    toDiagonalMatrix: function() {
	return Matrix.Diagonal(this.elements);
    },

    // Returns the result of rounding the elements of the vector
    round: function() {
	return this.map(function(x) { return Math.round(x); });
    },

    // Transpose a Vector, return a 1xn Matrix
    transpose: function() {
	var rows = this.elements.length;
	var elements = [];

	for (var i = 0; i < rows; i++) {
	    elements.push([this.elements[i]]);
	}
	return Matrix.create(elements);
    },

    // Returns a copy of the vector with elements set to the given value if they
    // differ from it by less than Sylvester.precision
    snapTo: function(x) {
	return this.map(function(y) {
	    return (Math.abs(y - x) <= Sylvester.precision) ? x : y;
	});
    },

    // Returns the vector's distance from the argument, when considered as a point in space
    distanceFrom: function(obj) {
	if (obj.anchor || (obj.start && obj.end)) { return obj.distanceFrom(this); }
	var V = obj.elements || obj;
	if (V.length != this.elements.length) { return null; }
	var sum = 0, part;
	this.each(function(x, i) {
	    part = x - V[i - 1];
	    sum += part * part;
	});
	return Math.sqrt(sum);
    },

    // Returns true if the vector is point on the given line
    liesOn: function(line) {
	return line.contains(this);
    },

    // Return true iff the vector is a point in the given plane
    liesIn: function(plane) {
	return plane.contains(this);
    },

    // Rotates the vector about the given object. The object should be a
    // point if the vector is 2D, and a line if it is 3D. Be careful with line directions!
    rotate: function(t, obj) {
	var V, R = null, x, y, z;
	if (t.determinant) { R = t.elements; }
	switch (this.elements.length) {
	case 2:
            V = obj.elements || obj;
            if (V.length != 2) { return null; }
            if (!R) { R = Matrix.Rotation(t).elements; }
            x = this.elements[0] - V[0];
            y = this.elements[1] - V[1];
            return Vector.create([
		V[0] + R[0][0] * x + R[0][1] * y,
		V[1] + R[1][0] * x + R[1][1] * y
            ]);
            break;
	case 3:
            if (!obj.direction) { return null; }
            var C = obj.pointClosestTo(this).elements;
            if (!R) { R = Matrix.Rotation(t, obj.direction).elements; }
            x = this.elements[0] - C[0];
            y = this.elements[1] - C[1];
            z = this.elements[2] - C[2];
            return Vector.create([
		C[0] + R[0][0] * x + R[0][1] * y + R[0][2] * z,
		C[1] + R[1][0] * x + R[1][1] * y + R[1][2] * z,
		C[2] + R[2][0] * x + R[2][1] * y + R[2][2] * z
            ]);
            break;
	default:
            return null;
	}
    },

    // Returns the result of reflecting the point in the given point, line or plane
    reflectionIn: function(obj) {
	if (obj.anchor) {
	    // obj is a plane or line
	    var P = this.elements.slice();
	    var C = obj.pointClosestTo(P).elements;
	    return Vector.create([C[0] + (C[0] - P[0]), C[1] + (C[1] - P[1]), C[2] + (C[2] - (P[2] || 0))]);
	} else {
	    // obj is a point
	    var Q = obj.elements || obj;
	    if (this.elements.length != Q.length) { return null; }
	    return this.map(function(x, i) { return Q[i - 1] + (Q[i - 1] - x); });
	}
    },

    // Utility to make sure vectors are 3D. If they are 2D, a zero z-component is added
    to3D: function() {
	var V = this.dup();
	switch (V.elements.length) {
	case 3: break;
	case 2: V.elements.push(0); break;
	default: return null;
	}
	return V;
    },

    // Returns a string representation of the vector
    inspect: function() {
	return '[' + this.elements.join(', ') + ']';
    },

    // Set vector's elements from an array
    setElements: function(els) {
	this.elements = (els.elements || els).slice();
	return this;
    }
};

// Constructor function
Vector.create = function(elements) {
    var V = new Vector();
    return V.setElements(elements);
};

// i, j, k unit vectors
Vector.i = Vector.create([1, 0, 0]);
Vector.j = Vector.create([0, 1, 0]);
Vector.k = Vector.create([0, 0, 1]);

// Random vector of size n
Vector.Random = function(n) {
    var elements = [];
    while (n--) { elements.push(Math.random()); }
    return Vector.create(elements);
};

Vector.Fill = function(n, v) {
    var elements = [];
    while (n--) { elements.push(v); }
    return Vector.create(elements);
};

// Vector filled with zeros
Vector.Zero = function(n) {
    return Vector.Fill(n, 0);
};

Vector.One = function(n) {
    return Vector.Fill(n, 1);
};

Vector.log = function(v) {
    return v.map(function(x) {
	return Math.log(x);
    });
};

module.exports = Vector;

},{"./matrix":15,"./sylvester":17}],19:[function(require,module,exports){
"use strict";

/**
 * Represents a 2-dimensional size value. 
 */

function Size(w, h) {
  this.w = w;
  this.h = h;
}

Size.prototype = {
  toString: function () {
    return "(" + this.w + ", " + this.h + ")";
  },
  getHalfSize: function() {
    return new Size(this.w >>> 1, this.h >>> 1);
  },
  length: function() {
    return this.w * this.h;
  }
}
module.exports = Size;
},{}],20:[function(require,module,exports){
"use strict";

var error = require('./error');

function assert(condition, message) {
  if (!condition) {
    error(message);
  }
}


module.exports = assert;

},{"./error":21}],21:[function(require,module,exports){
"use strict";

function error(message) {
  console.error(message);
  console.trace();
}

module.exports = error;

},{}],22:[function(require,module,exports){
"use strict";

var Matrix = require('sylvester.js').Matrix;
var Vector = require('sylvester.js').Vector;
var $M     = Matrix.create;


// augment Sylvester some
Matrix.Translation = function (v)
{
  if (v.elements.length == 2) {
    var r = Matrix.I(3);
    r.elements[2][0] = v.elements[0];
    r.elements[2][1] = v.elements[1];
    return r;
  }

  if (v.elements.length == 3) {
    var r = Matrix.I(4);
    r.elements[0][3] = v.elements[0];
    r.elements[1][3] = v.elements[1];
    r.elements[2][3] = v.elements[2];
    return r;
  }

  throw "Invalid length for Translation";
}

Matrix.prototype.flatten = function ()
{
    var result = [];
    if (this.elements.length == 0)
        return [];


    for (var j = 0; j < this.elements[0].length; j++)
        for (var i = 0; i < this.elements.length; i++)
            result.push(this.elements[i][j]);
    return result;
}

Matrix.prototype.ensure4x4 = function()
{
    if (this.elements.length == 4 &&
        this.elements[0].length == 4)
        return this;

    if (this.elements.length > 4 ||
        this.elements[0].length > 4)
        return null;

    for (var i = 0; i < this.elements.length; i++) {
        for (var j = this.elements[i].length; j < 4; j++) {
            if (i == j)
                this.elements[i].push(1);
            else
                this.elements[i].push(0);
        }
    }

    for (var i = this.elements.length; i < 4; i++) {
        if (i == 0)
            this.elements.push([1, 0, 0, 0]);
        else if (i == 1)
            this.elements.push([0, 1, 0, 0]);
        else if (i == 2)
            this.elements.push([0, 0, 1, 0]);
        else if (i == 3)
            this.elements.push([0, 0, 0, 1]);
    }

    return this;
};


Vector.prototype.flatten = function ()
{
    return this.elements;
};



//
// gluPerspective
//
function makePerspective(fovy, aspect, znear, zfar)
{
    var ymax = znear * Math.tan(fovy * Math.PI / 360.0);
    var ymin = -ymax;
    var xmin = ymin * aspect;
    var xmax = ymax * aspect;

    return makeFrustum(xmin, xmax, ymin, ymax, znear, zfar);
}

//
// glFrustum
//
function makeFrustum(left, right,
                     bottom, top,
                     znear, zfar)
{
    var X = 2*znear/(right-left);
    var Y = 2*znear/(top-bottom);
    var A = (right+left)/(right-left);
    var B = (top+bottom)/(top-bottom);
    var C = -(zfar+znear)/(zfar-znear);
    var D = -2*zfar*znear/(zfar-znear);

    return $M([[X, 0, A, 0],
               [0, Y, B, 0],
               [0, 0, C, D],
               [0, 0, -1, 0]]);
}

module.exports.makePerspective = makePerspective;


},{"sylvester.js":12}],23:[function(require,module,exports){
"use strict";

var Avc            = require('../broadway/Decoder');
var YUVWebGLCanvas = require('../canvas/YUVWebGLCanvas');
var YUVCanvas      = require('../canvas/YUVCanvas');
var Size           = require('../utils/Size');
var Class          = require('uclass');
var Events         = require('uclass/events');
var debug          = require('debug');
var log            = debug("wsavc");

var WSAvcPlayer = new Class({
  Implements : [Events],


  initialize : function(canvas, canvastype) {

    this.canvas     = canvas;
    this.canvastype = canvastype;

    // AVC codec initialization
    this.avc = new Avc();
    if(false) this.avc.configure({
      filter: "original",
      filterHorLuma: "optimized",
      filterVerLumaEdge: "optimized",
      getBoundaryStrengthsA: "optimized"
    });

    //WebSocket variable
    this.ws;
    this.pktnum = 0;

  },


  decode : function(data) {
    var naltype = "invalid frame";

    if (data.length > 4) {
      if (data[4] == 0x65) {
        naltype = "I frame";
      }
      else if (data[4] == 0x41) {
        naltype = "P frame";
      }
      else if (data[4] == 0x67) {
        naltype = "SPS";
      }
      else if (data[4] == 0x68) {
        naltype = "PPS";
      }
    }
    //log("Passed " + naltype + " to decoder");
    this.avc.decode(data);
  },

  connect : function(url) {

    // Websocket initialization
    if (this.ws != undefined) {
      this.ws.close();
      delete this.ws;
    }
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      log("Connected to " + url);
    };


    var framesList = [];

    this.ws.onmessage = (evt) => {
      if(typeof evt.data == "string")
        return this.cmd(JSON.parse(evt.data));

      this.pktnum++;
      var frame = new Uint8Array(evt.data);
      //log("[Pkt " + this.pktnum + " (" + evt.data.byteLength + " bytes)]");
      //this.decode(frame);
      framesList.push(frame);
    };


    var running = true;

    var shiftFrame = function() {
      if(!running)
        return;


      if(framesList.length > 10) {
        log("Dropping frames", framesList.length);
        framesList = [];
      }

      var frame = framesList.shift();


      if(frame)
        this.decode(frame);

      requestAnimationFrame(shiftFrame);
    }.bind(this);


    shiftFrame();



    this.ws.onclose = () => {
      running = false;
      log("WSAvcPlayer: Connection closed")
    };

  },

  initCanvas : function(width, height) {
    var canvasFactory = this.canvastype == "webgl" || this.canvastype == "YUVWebGLCanvas"
                        ? YUVWebGLCanvas
                        : YUVCanvas;

    var canvas = new canvasFactory(this.canvas, new Size(width, height));
    this.avc.onPictureDecoded = canvas.decode;
    this.emit("canvasReady", width, height);
  },

  cmd : function(cmd){
    log("Incoming request", cmd);

    if(cmd.action == "init") {
      this.initCanvas(cmd.width, cmd.height);
      this.canvas.width  = cmd.width;
      this.canvas.height = cmd.height;
    }
  },

  disconnect : function() {
    this.ws.close();
  },

  playStream : function() {
    var message = "REQUESTSTREAM ";
    this.ws.send(message);
    log("Sent " + message);
  },


  stopStream : function() {
    this.ws.send("STOPSTREAM");
    log("Sent STOPSTREAM");
  },
});


module.exports = WSAvcPlayer;
module.exports.debug = debug;

},{"../broadway/Decoder":4,"../canvas/YUVCanvas":10,"../canvas/YUVWebGLCanvas":11,"../utils/Size":19,"debug":1,"uclass":47,"uclass/events":24}],24:[function(require,module,exports){
"use strict";

var Class = require('../');
var guid  = require('mout/random/guid');
var forIn  = require('mout/object/forIn');

var EventEmitter = new Class({
  Binds : ['on', 'off', 'once', 'emit'],

  callbacks : {},

  initialize : function() {
    var self = this;
    this.addEvent = this.on;
    this.removeListener = this.off;
    this.removeAllListeners = this.off;
    this.fireEvent = this.emit;
  },

  emit:function(event, payload){
    if(!this.callbacks[event])
      return;

    var args = Array.prototype.slice.call(arguments, 1);

    forIn(this.callbacks[event], function(callback){
      callback.apply(null, args);
    });
  },


  on:function(event, callback){
    if(typeof callback != "function")
      return console.log("you try to register a non function in " , event)
    if(!this.callbacks[event])
      this.callbacks[event] = {};
    this.callbacks[event][guid()] = callback;
  },

  once:function(event, callback){
    var self = this;
    var once = function(){
      self.off(event, once);
      self.off(event, callback);
    };

    this.on(event, callback);
    this.on(event, once);
  },

  off:function(event, callback){
    if(!event)
      this.callbacks = {};
    else if(!callback)
      this.callbacks[event] = {};
    else forIn(this.callbacks[event] || {}, function(v, k) {
      if(v == callback)
        delete this.callbacks[event][k];
    }, this);
  },
});

module.exports = EventEmitter;
},{"../":47,"mout/object/forIn":36,"mout/random/guid":42}],25:[function(require,module,exports){
"use strict";

var verbs = /^Implements|Extends|Binds$/

module.exports = function(ctx, obj){
  for(var key in obj) {
    if(key.match(verbs)) continue;
    if((typeof obj[key] == 'function') && obj[key].$static)
      ctx[key] = obj[key];
    else
      ctx.prototype[key] = obj[key];
  }
  return ctx;
}
},{}],26:[function(require,module,exports){
var kindOf = require('./kindOf');
var isPlainObject = require('./isPlainObject');
var mixIn = require('../object/mixIn');

    /**
     * Clone native types.
     */
    function clone(val){
        switch (kindOf(val)) {
            case 'Object':
                return cloneObject(val);
            case 'Array':
                return cloneArray(val);
            case 'RegExp':
                return cloneRegExp(val);
            case 'Date':
                return cloneDate(val);
            default:
                return val;
        }
    }

    function cloneObject(source) {
        if (isPlainObject(source)) {
            return mixIn({}, source);
        } else {
            return source;
        }
    }

    function cloneRegExp(r) {
        var flags = '';
        flags += r.multiline ? 'm' : '';
        flags += r.global ? 'g' : '';
        flags += r.ignoreCase ? 'i' : '';
        return new RegExp(r.source, flags);
    }

    function cloneDate(date) {
        return new Date(+date);
    }

    function cloneArray(arr) {
        return arr.slice();
    }

    module.exports = clone;



},{"../object/mixIn":40,"./isPlainObject":32,"./kindOf":33}],27:[function(require,module,exports){
var mixIn = require('../object/mixIn');

    /**
     * Create Object using prototypal inheritance and setting custom properties.
     * - Mix between Douglas Crockford Prototypal Inheritance <http://javascript.crockford.com/prototypal.html> and the EcmaScript 5 `Object.create()` method.
     * @param {object} parent    Parent Object.
     * @param {object} [props] Object properties.
     * @return {object} Created object.
     */
    function createObject(parent, props){
        function F(){}
        F.prototype = parent;
        return mixIn(new F(), props);

    }
    module.exports = createObject;



},{"../object/mixIn":40}],28:[function(require,module,exports){
var clone = require('./clone');
var forOwn = require('../object/forOwn');
var kindOf = require('./kindOf');
var isPlainObject = require('./isPlainObject');

    /**
     * Recursively clone native types.
     */
    function deepClone(val, instanceClone) {
        switch ( kindOf(val) ) {
            case 'Object':
                return cloneObject(val, instanceClone);
            case 'Array':
                return cloneArray(val, instanceClone);
            default:
                return clone(val);
        }
    }

    function cloneObject(source, instanceClone) {
        if (isPlainObject(source)) {
            var out = {};
            forOwn(source, function(val, key) {
                this[key] = deepClone(val, instanceClone);
            }, out);
            return out;
        } else if (instanceClone) {
            return instanceClone(source);
        } else {
            return source;
        }
    }

    function cloneArray(arr, instanceClone) {
        var out = [],
            i = -1,
            n = arr.length,
            val;
        while (++i < n) {
            out[i] = deepClone(arr[i], instanceClone);
        }
        return out;
    }

    module.exports = deepClone;




},{"../object/forOwn":37,"./clone":26,"./isPlainObject":32,"./kindOf":33}],29:[function(require,module,exports){
var isKind = require('./isKind');
    /**
     */
    var isArray = Array.isArray || function (val) {
        return isKind(val, 'Array');
    };
    module.exports = isArray;


},{"./isKind":30}],30:[function(require,module,exports){
var kindOf = require('./kindOf');
    /**
     * Check if value is from a specific "kind".
     */
    function isKind(val, kind){
        return kindOf(val) === kind;
    }
    module.exports = isKind;


},{"./kindOf":33}],31:[function(require,module,exports){
var isKind = require('./isKind');
    /**
     */
    function isObject(val) {
        return isKind(val, 'Object');
    }
    module.exports = isObject;


},{"./isKind":30}],32:[function(require,module,exports){


    /**
     * Checks if the value is created by the `Object` constructor.
     */
    function isPlainObject(value) {
        return (!!value && typeof value === 'object' &&
            value.constructor === Object);
    }

    module.exports = isPlainObject;



},{}],33:[function(require,module,exports){


    var _rKind = /^\[object (.*)\]$/,
        _toString = Object.prototype.toString,
        UNDEF;

    /**
     * Gets the "kind" of value. (e.g. "String", "Number", etc)
     */
    function kindOf(val) {
        if (val === null) {
            return 'Null';
        } else if (val === UNDEF) {
            return 'Undefined';
        } else {
            return _rKind.exec( _toString.call(val) )[1];
        }
    }
    module.exports = kindOf;


},{}],34:[function(require,module,exports){
/**
 * @constant Maximum 32-bit signed integer value. (2^31 - 1)
 */

    module.exports = 2147483647;


},{}],35:[function(require,module,exports){
/**
 * @constant Minimum 32-bit signed integer value (-2^31).
 */

    module.exports = -2147483648;


},{}],36:[function(require,module,exports){
var hasOwn = require('./hasOwn');

    var _hasDontEnumBug,
        _dontEnums;

    function checkDontEnum(){
        _dontEnums = [
                'toString',
                'toLocaleString',
                'valueOf',
                'hasOwnProperty',
                'isPrototypeOf',
                'propertyIsEnumerable',
                'constructor'
            ];

        _hasDontEnumBug = true;

        for (var key in {'toString': null}) {
            _hasDontEnumBug = false;
        }
    }

    /**
     * Similar to Array/forEach but works over object properties and fixes Don't
     * Enum bug on IE.
     * based on: http://whattheheadsaid.com/2010/10/a-safer-object-keys-compatibility-implementation
     */
    function forIn(obj, fn, thisObj){
        var key, i = 0;
        // no need to check if argument is a real object that way we can use
        // it for arrays, functions, date, etc.

        //post-pone check till needed
        if (_hasDontEnumBug == null) checkDontEnum();

        for (key in obj) {
            if (exec(fn, obj, key, thisObj) === false) {
                break;
            }
        }


        if (_hasDontEnumBug) {
            var ctor = obj.constructor,
                isProto = !!ctor && obj === ctor.prototype;

            while (key = _dontEnums[i++]) {
                // For constructor, if it is a prototype object the constructor
                // is always non-enumerable unless defined otherwise (and
                // enumerated above).  For non-prototype objects, it will have
                // to be defined on this object, since it cannot be defined on
                // any prototype objects.
                //
                // For other [[DontEnum]] properties, check if the value is
                // different than Object prototype value.
                if (
                    (key !== 'constructor' ||
                        (!isProto && hasOwn(obj, key))) &&
                    obj[key] !== Object.prototype[key]
                ) {
                    if (exec(fn, obj, key, thisObj) === false) {
                        break;
                    }
                }
            }
        }
    }

    function exec(fn, obj, key, thisObj){
        return fn.call(thisObj, obj[key], key, obj);
    }

    module.exports = forIn;



},{"./hasOwn":38}],37:[function(require,module,exports){
var hasOwn = require('./hasOwn');
var forIn = require('./forIn');

    /**
     * Similar to Array/forEach but works over object properties and fixes Don't
     * Enum bug on IE.
     * based on: http://whattheheadsaid.com/2010/10/a-safer-object-keys-compatibility-implementation
     */
    function forOwn(obj, fn, thisObj){
        forIn(obj, function(val, key){
            if (hasOwn(obj, key)) {
                return fn.call(thisObj, obj[key], key, obj);
            }
        });
    }

    module.exports = forOwn;



},{"./forIn":36,"./hasOwn":38}],38:[function(require,module,exports){


    /**
     * Safer Object.hasOwnProperty
     */
     function hasOwn(obj, prop){
         return Object.prototype.hasOwnProperty.call(obj, prop);
     }

     module.exports = hasOwn;



},{}],39:[function(require,module,exports){
var hasOwn = require('./hasOwn');
var deepClone = require('../lang/deepClone');
var isObject = require('../lang/isObject');

    /**
     * Deep merge objects.
     */
    function merge() {
        var i = 1,
            key, val, obj, target;

        // make sure we don't modify source element and it's properties
        // objects are passed by reference
        target = deepClone( arguments[0] );

        while (obj = arguments[i++]) {
            for (key in obj) {
                if ( ! hasOwn(obj, key) ) {
                    continue;
                }

                val = obj[key];

                if ( isObject(val) && isObject(target[key]) ){
                    // inception, deep merge objects
                    target[key] = merge(target[key], val);
                } else {
                    // make sure arrays, regexp, date, objects are cloned
                    target[key] = deepClone(val);
                }

            }
        }

        return target;
    }

    module.exports = merge;



},{"../lang/deepClone":28,"../lang/isObject":31,"./hasOwn":38}],40:[function(require,module,exports){
var forOwn = require('./forOwn');

    /**
    * Combine properties from all the objects into first one.
    * - This method affects target object in place, if you want to create a new Object pass an empty object as first param.
    * @param {object} target    Target Object
    * @param {...object} objects    Objects to be combined (0...n objects).
    * @return {object} Target Object.
    */
    function mixIn(target, objects){
        var i = 0,
            n = arguments.length,
            obj;
        while(++i < n){
            obj = arguments[i];
            if (obj != null) {
                forOwn(obj, copyProp, target);
            }
        }
        return target;
    }

    function copyProp(val, key){
        this[key] = val;
    }

    module.exports = mixIn;


},{"./forOwn":37}],41:[function(require,module,exports){
var randInt = require('./randInt');
var isArray = require('../lang/isArray');

    /**
     * Returns a random element from the supplied arguments
     * or from the array (if single argument is an array).
     */
    function choice(items) {
        var target = (arguments.length === 1 && isArray(items))? items : arguments;
        return target[ randInt(0, target.length - 1) ];
    }

    module.exports = choice;



},{"../lang/isArray":29,"./randInt":45}],42:[function(require,module,exports){
var randHex = require('./randHex');
var choice = require('./choice');

  /**
   * Returns pseudo-random guid (UUID v4)
   * IMPORTANT: it's not totally "safe" since randHex/choice uses Math.random
   * by default and sequences can be predicted in some cases. See the
   * "random/random" documentation for more info about it and how to replace
   * the default PRNG.
   */
  function guid() {
    return (
        randHex(8)+'-'+
        randHex(4)+'-'+
        // v4 UUID always contain "4" at this position to specify it was
        // randomly generated
        '4' + randHex(3) +'-'+
        // v4 UUID always contain chars [a,b,8,9] at this position
        choice(8, 9, 'a', 'b') + randHex(3)+'-'+
        randHex(12)
    );
  }
  module.exports = guid;


},{"./choice":41,"./randHex":44}],43:[function(require,module,exports){
var random = require('./random');
var MIN_INT = require('../number/MIN_INT');
var MAX_INT = require('../number/MAX_INT');

    /**
     * Returns random number inside range
     */
    function rand(min, max){
        min = min == null? MIN_INT : min;
        max = max == null? MAX_INT : max;
        return min + (max - min) * random();
    }

    module.exports = rand;


},{"../number/MAX_INT":34,"../number/MIN_INT":35,"./random":46}],44:[function(require,module,exports){
var choice = require('./choice');

    var _chars = '0123456789abcdef'.split('');

    /**
     * Returns a random hexadecimal string
     */
    function randHex(size){
        size = size && size > 0? size : 6;
        var str = '';
        while (size--) {
            str += choice(_chars);
        }
        return str;
    }

    module.exports = randHex;



},{"./choice":41}],45:[function(require,module,exports){
var MIN_INT = require('../number/MIN_INT');
var MAX_INT = require('../number/MAX_INT');
var rand = require('./rand');

    /**
     * Gets random integer inside range or snap to min/max values.
     */
    function randInt(min, max){
        min = min == null? MIN_INT : ~~min;
        max = max == null? MAX_INT : ~~max;
        // can't be max + 0.5 otherwise it will round up if `rand`
        // returns `max` causing it to overflow range.
        // -0.5 and + 0.49 are required to avoid bias caused by rounding
        return Math.round( rand(min - 0.5, max + 0.499999999999) );
    }

    module.exports = randInt;


},{"../number/MAX_INT":34,"../number/MIN_INT":35,"./rand":43}],46:[function(require,module,exports){


    /**
     * Just a wrapper to Math.random. No methods inside mout/random should call
     * Math.random() directly so we can inject the pseudo-random number
     * generator if needed (ie. in case we need a seeded random or a better
     * algorithm than the native one)
     */
    function random(){
        return random.get();
    }

    // we expose the method so it can be swapped if needed
    random.get = Math.random;

    module.exports = random;



},{}],47:[function(require,module,exports){
"use strict";

var hasOwn = require("mout/object/hasOwn");
var create = require("mout/lang/createObject");
var merge  = require("mout/object/merge");
var kindOf = require("mout/lang/kindOf");
var mixIn  = require("mout/object/mixIn");

var implement = require('./implement');
var verbs = /^Implements|Extends|Binds$/




var uClass = function(proto){

  if(kindOf(proto) === "Function") proto = {initialize: proto};

  var superprime = proto.Extends;

  var constructor = (hasOwn(proto, "initialize")) ? proto.initialize : superprime ? superprime : function(){};



  var out = function() {
    var self = this;
      //autobinding takes place here
    if(proto.Binds) proto.Binds.forEach(function(f){
      var original = self[f];
      if(original)
        self[f] = mixIn(self[f].bind(self), original);
    });

      //clone non function/static properties to current instance
    for(var key in out.prototype) {
      var v = out.prototype[key], t = kindOf(v);

      if(key.match(verbs) || t === "Function" || t == "GeneratorFunction")
        continue;

      if(t == "Object")
        self[key] = merge({}, self[key]); //create(null, self[key]);
      else if(t == "Array")
        self[key] = v.slice(); //clone ??
      else
        self[key] = v;
    }

    if(proto.Implements)
      proto.Implements.forEach(function(Mixin){
        Mixin.call(self);
      });




    constructor.apply(this, arguments);
  }


  if (superprime) {
    // inherit from superprime
      var superproto = superprime.prototype;
      if(superproto.Binds)
        proto.Binds = (proto.Binds || []).concat(superproto.Binds);

      if(superproto.Implements)
        proto.Implements = (proto.Implements || []).concat(superproto.Implements);

      var cproto = out.prototype = create(superproto);
      // setting constructor.parent to superprime.prototype
      // because it's the shortest possible absolute reference
      out.parent = superproto;
      cproto.constructor = out

  }


 if(proto.Implements) {
    if (kindOf(proto.Implements) !== "Array")
      proto.Implements = [proto.Implements];
    proto.Implements.forEach(function(Mixin){
      implement(out, Mixin.prototype);
    });
  }

  implement(out, proto);
  if(proto.Binds)
     out.prototype.Binds = proto.Binds;
  if(proto.Implements)
     out.prototype.Implements = proto.Implements;

  return out;
};



module.exports = uClass;
},{"./implement":25,"mout/lang/createObject":27,"mout/lang/kindOf":33,"mout/object/hasOwn":38,"mout/object/merge":39,"mout/object/mixIn":40}]},{},[23])(23)
});
