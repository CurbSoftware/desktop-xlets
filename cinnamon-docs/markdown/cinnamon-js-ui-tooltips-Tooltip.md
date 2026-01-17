|                                                                                                                                                            |                                                                        |                                                                     |                                                                         |                                                               |
|:-----------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-Tooltip.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-Tooltip.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span>                                                                                                                | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                              width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-tooltips-section.html" accesskey="u"><img   
                                                                                                                                                                                                                                       src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-tooltips-TooltipBase.html" accesskey="p"><img   
                                                                                                                                                                                                                                                                                                             src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-tooltips-PanelItemTooltip.html"       
                                                                                                                                                                                                                                                                                                                                                                                       accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                                       height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-tooltips-Tooltip"></span>

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
<td data-valign="top"><h2 id="tooltips.tooltip"><span
class="refentrytitle"><span
id="cinnamon-js-ui-tooltips-Tooltip.top_of_page"></span>Tooltips.Tooltip</span></h2>
<p>Tooltips.Tooltip</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-Tooltip.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                         |
|-----------------------------------|-----------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                      
                                     href="cinnamon-js-ui-tooltips-Tooltip.html#cinnamon-js-ui-tooltips-Tooltip-_init"        
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>            |
| <span class="returnvalue"></span> | <a                                                                                      
                                     href="cinnamon-js-ui-tooltips-Tooltip.html#cinnamon-js-ui-tooltips-Tooltip-set_text"     
                                     class="link" title="set_text ()">set_text</a> <span class="c_punctuation">()</span>      |
| <span class="returnvalue"></span> | <a                                                                                      
                                     href="cinnamon-js-ui-tooltips-Tooltip.html#cinnamon-js-ui-tooltips-Tooltip-set_markup"   
                                     class="link" title="set_markup ()">set_markup</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-Tooltip.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Tooltips.TooltipBase
        ╰── Tooltips.Tooltip
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-Tooltip.description"></span>

## Description

This is a tooltip item that displays some text. The tooltip will be
displayed such that the top left corner of the label is at the mouse
position.

This is not suitable for use in applets, since in the case of applets,
we don't want the tooltip at the position of the mouse. Instead, it
should appear above/below the panel without overlapping with the applet.
Hence the
<a href="cinnamon-js-ui-tooltips-PanelItemTooltip.html" class="link"
title="Tooltips.PanelItemTooltip"><code
class="code">PanelItemTooltip</code></a> class should be used instead.

Note that the tooltip refuses to show if the tooltip text is empty.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-Tooltip.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-Tooltip-_init"></span>

### \_init ()

``` programlisting

_init (Clutter.Actor   item,
       string          initTitle);
```

<div class="refsect3">

<span id="id-1.2.21.3.6.2.4"></span>

#### Parameters

<div class="informaltable">

|           |                                 |     |
|-----------|---------------------------------|-----|
| item      | the actor owning the tooltip    |     |
| initTitle | the string to display initially |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-Tooltip-set_text"></span>

### set_text ()

``` programlisting

set_text (string   text);
```

Sets the text to display to `text`.

<div class="refsect3">

<span id="id-1.2.21.3.6.3.5"></span>

#### Parameters

<div class="informaltable">

|      |                     |     |
|------|---------------------|-----|
| text | new text to display |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-Tooltip-set_markup"></span>

### set_markup ()

``` programlisting

set_markup (string   text);
```

Sets the text to display to `markup`.

<div class="refsect3">

<span id="id-1.2.21.3.6.4.5"></span>

#### Parameters

<div class="informaltable">

|      |                     |     |
|------|---------------------|-----|
| text | new text to display |     |

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
