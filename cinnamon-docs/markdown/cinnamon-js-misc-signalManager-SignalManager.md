|                                                                                                                                                                         |                                                                        |                                                                          |                                                                          |                                                                          |
|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-misc-signalManager-SignalManager.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-misc-signalManager-SignalManager.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-misc-signalManager-SignalManager.properties"  
 class="shortcut">Properties</a></span>                                                                                                                                   | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                           width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-misc-signalManager-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                                    src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>       | <a href="cinnamon-js-misc-signalManager-section.html" accesskey="p"><img 
                                                                                                                                                                                                                                                                                                                               src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>   | <a href="cinnamon-js-misc-util-section.html" accesskey="n"><img          
                                                                                                                                                                                                                                                                                                                                                                                                          src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-misc-signalManager-SignalManager"></span>

<div class="titlepage">

</div>

<div class="refnamediv">

<table width="100%">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td data-valign="top"><h2 id="signalmanager.signalmanager"><span
class="refentrytitle"><span
id="cinnamon-js-misc-signalManager-SignalManager.top_of_page"></span>SignalManager.SignalManager</span></h2>
<p>SignalManager.SignalManager — A convenience object for managing
signals</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.functions"></span>

## Functions

<div class="informaltable">

|                                        |                                                                                                                            |
|----------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span>      | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-_init"                 
                                          class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                                               |
| <span class="returnvalue"></span>      | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-connect"               
                                          class="link" title="connect ()">connect</a> <span class="c_punctuation">()</span>                                           |
| <span class="returnvalue"></span>      | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-isConnected"           
                                          class="link" title="isConnected ()">isConnected</a> <span class="c_punctuation">()</span>                                   |
| <span class="returnvalue">Array</span> | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-getSignals"            
                                          class="link" title="getSignals ()">getSignals</a> <span class="c_punctuation">()</span>                                     |
| <span class="returnvalue"></span>      | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-disconnect"            
                                          class="link" title="disconnect ()">disconnect</a> <span class="c_punctuation">()</span>                                     |
| <span class="returnvalue"></span>      | <a                                                                                                                         
                                          href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager-disconnectAllSignals"  
                                          class="link" title="disconnectAllSignals ()">disconnectAllSignals</a> <span class="c_punctuation">()</span>                 |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.properties"></span>

## Properties

<div class="informaltable">

|                                  |                                                                                                                 |     |
|----------------------------------|-----------------------------------------------------------------------------------------------------------------|-----|
| <span class="type">Object</span> | <a                                                                                                              
                                    href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager--_object"   
                                    class="link" title="The “_object” property">_object</a>                                                          |     |
| <span class="type">Array</span>  | <a                                                                                                              
                                    href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager--_storage"  
                                    class="link" title="The “_storage” property">_storage</a>                                                        |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── SignalManager.SignalManager
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.description"></span>

## Description

The
<a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link"
title="SignalManager.SignalManager"><code
class="code">SignalManager</code></a> is a convenience object for
managing signals. If you use this to connect signals, you can later
disconnect them by signal name or just disconnect everything! No need to
keep track of those annoying `signalIds` by yourself anymore!

A common use case is to use the
<a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link"
title="SignalManager.SignalManager"><code
class="code">SignalManager</code></a> to connect to signals and then use
the `disconnectAllSignals` function when the object is destroyed, to
avoid keeping track of all the signals manually.

However, this is not always needed. If you are connecting to a signal of
your actor, the signals are automatically disconnected when you destroy
the actor. Using the
<a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link"
title="SignalManager.SignalManager"><code
class="code">SignalManager</code></a> to disconnect all signals is only
needed when connecting to objects that persists after the object
disappears.

Every Javascript object should have its own `SignalManager`, and use it
to connect signals of all objects it takes care of. For example, the
panel will have one `SignalManger` object, which manages all signals
from `GSettings`, `global.display` etc.

An example usage is as follows:

<div class="informalexample">

<table class="listing_frame" data-border="0" data-cellpadding="0"
data-cellspacing="0">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td class="listing_lines" style="text-align: right;"><pre><code>1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>class MyApplet extends Applet.Applet {
    constructor(orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
&#10;        this._signalManager = new SignalManager.SignalManager(null);
        this._signalManager.connect(global.settings, &quot;changed::foo&quot;, (...args) =&gt; this._onChanged(...args));
    }
&#10;    _onChanged() {
        // Do something
    }
&#10;    on_applet_removed_from_panel() {
        this._signalManager.disconnectAllSignals();
    }
}</code></pre></td>
</tr>
</tbody>
</table>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-_init"></span>

### \_init ()

``` programlisting

_init (Object   object);
```

<div class="refsect3">

<span id="id-1.3.2.2.7.2.4"></span>

#### Parameters

<div class="informaltable">

|        |                                                                                                |     |
|--------|------------------------------------------------------------------------------------------------|-----|
| object | the object owning the <a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link" 
          title="SignalManager.SignalManager"><code                                                       
          class="code">SignalManager</code></a> (usually `this`) (Deprecated)                             |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-connect"></span>

### connect ()

``` programlisting

connect (Object     obj,
         string     sigName,
         function   callback,
         Object     bind,
         boolean    force);
```

This listens to the signal `sigName` from `obj` and calls `callback`
when the signal is emitted. `callback` is bound to the `bind` argument
if passed.

This checks whether the signal is already connected and will not connect
again if it is already connected. This behaviour can be overridden by
settings `force` to be `true`.

For example, what you would normally write as

<div class="informalexample">

<table class="listing_frame" data-border="0" data-cellpadding="0"
data-cellspacing="0">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td class="listing_lines" style="text-align: right;"><pre><code>1</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>global.settings.connect(&quot;changed::foo&quot;, Lang.bind(this, this._bar))</code></pre></td>
</tr>
</tbody>
</table>

</div>

would become

<div class="informalexample">

<table class="listing_frame" data-border="0" data-cellpadding="0"
data-cellspacing="0">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td class="listing_lines" style="text-align: right;"><pre><code>1</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>this._signalManager.connect(global.settings, &quot;changed::foo&quot;, this._bar)</code></pre></td>
</tr>
</tbody>
</table>

</div>

Note that in this function, the first argument is the object, while the
second is the signal name. In all other methods, you first pass the
signal name, then the object (since the object is rarely passed in other
functions).

<div class="refsect3">

<span id="id-1.3.2.2.7.3.11"></span>

#### Parameters

<div class="informaltable">

|          |                                                                                                                                                          |     |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| obj      | the object whose signal we are listening to                                                                                                              |     |
| sigName  | the name of the signal we are listening to                                                                                                               |     |
| callback | the callback function                                                                                                                                    |     |
| bind     | (optional) the object to bind the function to. Leave empty for the owner of the <a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link" 
            title="SignalManager.SignalManager"><code                                                                                                                 
            class="code">SignalManager</code></a> (which has no side effects if you don't need to bind at all).                                                       |     |
| force    | whether to connect again even if it is connected                                                                                                         |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-isConnected"></span>

### isConnected ()

``` programlisting

isConnected (string     sigName,
             Object     obj,
             function   callback);
```

This checks whether the signal `sigName` is connected. The optional
arguments `obj` and `callback` can be used to specify what signals in
particular we want to know. Note that when you supply `callBack`, you
usually want to supply `obj` as well, since two different objects can
connect to the same signal with the same callback.

This is functionally equivalent to (and implemented as)

<div class="informalexample">

<table class="listing_frame" data-border="0" data-cellpadding="0"
data-cellspacing="0">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td class="listing_lines" style="text-align: right;"><pre><code>1</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>this.getSignals(arguments).length &gt; 0);</code></pre></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect3">

<span id="id-1.3.2.2.7.4.7"></span>

#### Parameters

<div class="informaltable">

|          |                                                                                                                  |     |
|----------|------------------------------------------------------------------------------------------------------------------|-----|
| sigName  | the signal we care about                                                                                         |     |
| obj      | (optional) the object we care about, or leave empty if we don't care about which object it is                    |     |
| callback | (optional) the callback function we care about, or leave empty if we don't care about what callback is connected |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.3.2.2.7.4.8"></span>

#### Returns

Whether the signal is connected

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-getSignals"></span>

### getSignals ()

``` programlisting
Array
getSignals (string     sigName,
            Object     obj,
            function   callback);
```

This returns the list of all signals that matches the description
provided. Each signal is represented by an array in the form
`[signalName, object, callback, signalId]`.

<div class="refsect3">

<span id="id-1.3.2.2.7.5.5"></span>

#### Parameters

<div class="informaltable">

|          |                                                                                                                  |     |
|----------|------------------------------------------------------------------------------------------------------------------|-----|
| sigName  | the signal we care about                                                                                         |     |
| obj      | (optional) the object we care about, or leave empty if we don't care about which object it is                    |     |
| callback | (optional) the callback function we care about, or leave empty if we don't care about what callback is connected |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.3.2.2.7.5.6"></span>

#### Returns

The list of signals

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-disconnect"></span>

### disconnect ()

``` programlisting

disconnect (string     sigName,
            Object     obj,
            function   callback);
```

This disconnects all <span class="emphasis">*signals*</span> named
`sigName`. By default, it disconnects the signal on all objects, but can
be fine-tuned with the optional `obj` and `callback` arguments.

This function will do nothing if no such signal is connected, the object
no longer exists, or the signal is somehow already disconnected. So
checks need not be performed before calling this function.

<div class="refsect3">

<span id="id-1.3.2.2.7.6.6"></span>

#### Parameters

<div class="informaltable">

|          |                                                                                                                  |     |
|----------|------------------------------------------------------------------------------------------------------------------|-----|
| sigName  | the signal we care about                                                                                         |     |
| obj      | (optional) the object we care about, or leave empty if we don't care about which object it is                    |     |
| callback | (optional) the callback function we care about, or leave empty if we don't care about what callback is connected |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager-disconnectAllSignals"></span>

### disconnectAllSignals ()

``` programlisting

disconnectAllSignals ();
```

Disconnects <span class="emphasis">*all signals*</span> managed by the
<a href="cinnamon-js-misc-signalManager-SignalManager.html" class="link"
title="SignalManager.SignalManager"><code
class="code">SignalManager</code></a>. This is useful in the `destroy`
function of objects.

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-misc-signalManager-SignalManager.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager--_object"></span>

### The `“_object”` property

``` programlisting
  “_object”                  Object
```

The object owning the SignalManager. All callbacks are binded to <a
href="cinnamon-js-misc-signalManager-SignalManager.html#cinnamon-js-misc-signalManager-SignalManager--_object"
class="link" title="The “_object” property"><code
class="code">_object</code></a> unless otherwise specified.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-misc-signalManager-SignalManager--_storage"></span>

### The `“_storage”` property

``` programlisting
  “_storage”                 Array
```

An array that stores all the connected signals. Each signal is stored as
an array in the form `[signalName, object, callback, signalId]`.

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
