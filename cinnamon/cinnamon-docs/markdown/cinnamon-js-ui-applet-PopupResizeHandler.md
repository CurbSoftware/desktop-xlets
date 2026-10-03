|                                                                                                                                                                     |                                                                        |                                                                     |                                                                         |                                                                          |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-PopupResizeHandler.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-PopupResizeHandler.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-PopupResizeHandler.properties"  
 class="shortcut">Properties</a></span>                                                                                                                               | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                       width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-applet-section.html" accesskey="u"><img     
                                                                                                                                                                                                                                                src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-applet-TextIconApplet.html" accesskey="p"><img  
                                                                                                                                                                                                                                                                                                                      src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-appletManager-section.html" accesskey="n"><img   
                                                                                                                                                                                                                                                                                                                                                                                                src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-applet-PopupResizeHandler"></span>

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
<td data-valign="top"><h2 id="applet.popupresizehandler"><span
class="refentrytitle"><span
id="cinnamon-js-ui-applet-PopupResizeHandler.top_of_page"></span>Applet.PopupResizeHandler</span></h2>
<p>Applet.PopupResizeHandler — Class that allows an applet to be resized
using the mouse.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                           |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                        
                                     href="cinnamon-js-ui-applet-PopupResizeHandler.html#cinnamon-js-ui-applet-PopupResizeHandler-constructor"  
                                     class="link" title="constructor ()">constructor</a> <span class="c_punctuation">()</span>                  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.properties"></span>

## Properties

<div class="informaltable">

|                                   |                                                                                                                   |     |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------|-----|
| <span class="type">Boolean</span> | <a                                                                                                                
                                     href="cinnamon-js-ui-applet-PopupResizeHandler.html#cinnamon-js-ui-applet-PopupResizeHandler--inhibit_resizing"    
                                     class="link"                                                                                                       
                                     title="The “inhibit_resizing” property">inhibit_resizing</a>                                                       |     |
| <span class="type">Boolean</span> | <a                                                                                                                
                                     href="cinnamon-js-ui-applet-PopupResizeHandler.html#cinnamon-js-ui-applet-PopupResizeHandler--resizingInProgress"  
                                     class="link"                                                                                                       
                                     title="The “resizingInProgress” property">resizingInProgress</a>                                                   |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Applet.PopupResizeHandler
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.description"></span>

## Description

Example usage:

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
16
17
18
19</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>this.menu = new Applet.AppletPopupMenu(this, this.orientation);
this.settings.bind(&quot;popup-width&quot;, &quot;popup_width&quot;);
this.settings.bind(&quot;popup-height&quot;, &quot;popup_height&quot;);
&#10;this._resizer = new Applet.PopupResizeHandler(
        this.menu.actor,
        () =&gt; this.orientation,
        (w,h) =&gt; this._onBoxResized(w,h),
        () =&gt; this.popup_width * global.ui_scale,
        () =&gt; this.popup_height * global.ui_scale);
    &#10;...
&#10;_onBoxResized(width, height) {
    this.popup_width = Math.max(width / global.ui_scale, 300);
    this.popup_height = Math.max(height / global.ui_scale, 400);
    this.menu.actor.set_width(this.popup_width * global.ui_scale);
    this.menu.actor.set_height(this.popup_height * global.ui_scale);
}</code></pre></td>
</tr>
</tbody>
</table>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-applet-PopupResizeHandler-constructor"></span>

### constructor ()

``` programlisting

constructor (ClutterActor   actor,
             Function       get_orientation,
             Function       resized_callback,
             Function       get_user_width,
             Function       get_user_height);
```

<div class="refsect3">

<span id="id-1.2.1.9.7.2.4"></span>

#### Parameters

<div class="informaltable">

|                  |                                                                                                                                                                                                                                                                                                                                                      |     |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| actor            | The actor to be resized                                                                                                                                                                                                                                                                                                                              |     |
| get_orientation  | Function that returns the current orientation of the applet. (St.Side)                                                                                                                                                                                                                                                                               |     |
| resized_callback | Function that is called while resizing is in progress with the new width and height as parameters. This function should actually change the applet size. This is also called once when resizing has ended (resizingInProgress == false) so that the applet can store the final size instead of doing so continuously whilst resizing is in progress. |     |
| get_user_width   | Function that returns the current applet width. This function is not called while resizing is in progress so it only has to return the correct width when resizing is not in progress. Note: This value does not necessarily have to be the applet width. It could be the width of a container inside the applet used for sizing the applet.         |     |
| get_user_height  | As get_user_width but for height                                                                                                                                                                                                                                                                                                                     |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-PopupResizeHandler.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-applet-PopupResizeHandler--inhibit_resizing"></span>

### The `“inhibit_resizing”` property

``` programlisting
  “inhibit_resizing”         Boolean
```

Set to true to prevent resizing from starting.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-applet-PopupResizeHandler--resizingInProgress"></span>

### The `“resizingInProgress”` property

``` programlisting
  “resizingInProgress”       Boolean
```

True when resizing is in progress

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
