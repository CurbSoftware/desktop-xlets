|                                                                                                                                                                     |                                                                        |                                                                     |                                                                         |                                                                          |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-PanelItemTooltip.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-PanelItemTooltip.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-PanelItemTooltip.properties"  
 class="shortcut">Properties</a></span>                                                                                                                               | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                       width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-tooltips-section.html" accesskey="u"><img   
                                                                                                                                                                                                                                                src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-tooltips-Tooltip.html" accesskey="p"><img       
                                                                                                                                                                                                                                                                                                                      src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-tweener-section.html" accesskey="n"><img         
                                                                                                                                                                                                                                                                                                                                                                                                src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip"></span>

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
<td data-valign="top"><h2 id="tooltips.panelitemtooltip"><span
class="refentrytitle"><span
id="cinnamon-js-ui-tooltips-PanelItemTooltip.top_of_page"></span>Tooltips.PanelItemTooltip</span></h2>
<p>Tooltips.PanelItemTooltip</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                     |
|-----------------------------------|-----------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                  
                                     href="cinnamon-js-ui-tooltips-PanelItemTooltip.html#cinnamon-js-ui-tooltips-PanelItemTooltip-_init"  
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                        |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.properties"></span>

## Properties

<div class="informaltable">

|                                                                   |                                                                                                            |     |
|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|-----|
| <a href="cinnamon-js-ui-applet-Applet.html" class="link"          
 title="Applet.Applet"><span class="type">Applet.Applet</span></a>  | <a                                                                                                         
                                                                     href="cinnamon-js-ui-tooltips-PanelItemTooltip.html#cinnamon-js-ui-tooltips-PanelItemTooltip--_panelItem"   
                                                                     class="link" title="The “_panelItem” property">_panelItem</a>                                               |     |
| <span class="type">St.Side</span>                                 | <a                                                                                                         
                                                                     href="cinnamon-js-ui-tooltips-PanelItemTooltip.html#cinnamon-js-ui-tooltips-PanelItemTooltip--orientation"  
                                                                     class="link" title="The “orientation” property">orientation</a>                                             |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Tooltips.TooltipBase
        ╰── Tooltips.Tooltip
            ╰── Tooltips.PanelItemTooltip
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.description"></span>

## Description

A tooltip for panel applets. This is displayed above/below the panel
instead of at exactly the mouse position to avoid covering the applet.

It is possible that `panelItem` is not an applet, but a child of an
applet. An immediate example is for use in the window list, where each
individual item, instead of the applet, has its own tooltip. These
objects must have `panelItem._applet` set as the actual applet, since we
need to access the applet to listen to orientation changes.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip-_init"></span>

### \_init ()

``` programlisting

_init (Applet.Applet   panelItem,
       string          initTitle,
       St.Side         orientation);
```

It should be noted that `panelItem` is the
<span class="emphasis">*applet*</span> owning the tooltip, while that
usually passed to
<a href="cinnamon-js-ui-tooltips-Tooltip.html" class="link"
title="Tooltips.Tooltip"><code class="code">Tooltips.Tooltip</code></a>
is the <span class="emphasis">*actor*</span>. These are different
objects.

<div class="refsect3">

<span id="id-1.2.21.4.7.2.5"></span>

#### Parameters

<div class="informaltable">

|             |                                   |     |
|-------------|-----------------------------------|-----|
| panelItem   | the applet owning the tooltip     |     |
| initTitle   | the initial string of the tooltip |     |
| orientation | the orientation of the applet.    |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip--_panelItem"></span>

### The `“_panelItem”` property

``` programlisting
  “_panelItem”               Applet.Applet
```

The applet owning the tooltip

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-PanelItemTooltip--orientation"></span>

### The `“orientation”` property

``` programlisting
  “orientation”              St.Side
```

The orientation of the applet

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
