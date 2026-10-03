|                                                                                                                                                                |                                                                        |                                                                     |                                                                         |                                                                          |
|:---------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-TooltipBase.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-TooltipBase.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tooltips-TooltipBase.properties"  
 class="shortcut">Properties</a></span>                                                                                                                          | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                  width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-tooltips-section.html" accesskey="u"><img   
                                                                                                                                                                                                                                           src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-tooltips-section.html" accesskey="p"><img       
                                                                                                                                                                                                                                                                                                                 src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-tooltips-Tooltip.html" accesskey="n"><img        
                                                                                                                                                                                                                                                                                                                                                                                           src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-tooltips-TooltipBase"></span>

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
<td data-valign="top"><h2 id="tooltips.tooltipbase"><span
class="refentrytitle"><span
id="cinnamon-js-ui-tooltips-TooltipBase.top_of_page"></span>Tooltips.TooltipBase</span></h2>
<p>Tooltips.TooltipBase</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                             |
|-----------------------------------|---------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                          
                                     href="cinnamon-js-ui-tooltips-TooltipBase.html#cinnamon-js-ui-tooltips-TooltipBase-destroy"  
                                     class="link" title="destroy ()">destroy</a> <span class="c_punctuation">()</span>            |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.properties"></span>

## Properties

<div class="informaltable">

|                                         |                                                                                                    |     |
|-----------------------------------------|----------------------------------------------------------------------------------------------------|-----|
| <span class="type">Clutter.Actor</span> | <a                                                                                                 
                                           href="cinnamon-js-ui-tooltips-TooltipBase.html#cinnamon-js-ui-tooltips-TooltipBase--item"           
                                           class="link" title="The “item” property">item</a>                                                   |     |
| <span class="type">boolean</span>       | <a                                                                                                 
                                           href="cinnamon-js-ui-tooltips-TooltipBase.html#cinnamon-js-ui-tooltips-TooltipBase--visible"        
                                           class="link" title="The “visible” property">visible</a>                                             |     |
| <span class="type">boolean</span>       | <a                                                                                                 
                                           href="cinnamon-js-ui-tooltips-TooltipBase.html#cinnamon-js-ui-tooltips-TooltipBase--preventShow"    
                                           class="link" title="The “preventShow” property">preventShow</a>                                     |     |
| <span class="type">array</span>         | <a                                                                                                 
                                           href="cinnamon-js-ui-tooltips-TooltipBase.html#cinnamon-js-ui-tooltips-TooltipBase--mousePosition"  
                                           class="link" title="The “mousePosition” property">mousePosition</a>                                 |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Tooltips.TooltipBase
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.description"></span>

## Description

This is a base class for other tooltip items to inherit. This cannot be
instantiated.

All other tooltip items inherit this object. This base class is
responsible for listening to mouse events and determining when to show
the tooltip. When it thinks a tooltip should be shown, it calls
`this.show()`. When it thinks it should be hidden, it calls
`this.hide()`. When the `item` is destroyed, it will call
`this._destroy()`;

Any object wishing to implement a tooltip should inherit this class, and
then implement the three functions above. It should be noted that the
sole responsibility of this class is to call the three functions above.
It is thus the user's job to create the tooltip actor and position it
correctly in the `show` function. Example implementations for reference
include the <a href="cinnamon-js-ui-tooltips-Tooltip.html" class="link"
title="Tooltips.Tooltip"><code class="code">Tooltips.Tooltip</code></a>
object as well as the `WindowPreview` object in the window list applet.

When calling the `show` function,
<a href="cinnamon-js-ui-tooltips-TooltipBase.html" class="link"
title="Tooltips.TooltipBase"><code class="code">TooltipBase</code></a>
will set the `this.mousePosition` to the mouse coordinates at which the
event is triggered.

When implementing the `show` and `hide` functions, the user should set
the `this.visible` variable to the visibility state of the tooltip. This
is since calling the `show` function does not necessarily actually show
the tooltip, eg. when the tooltip text is empty and the tooltip refuses
to show. The `this.visible` variable should be set properly to reflect
the actual status of the tooltip.

Finally, if the user wishes to inhibit the display of a tooltip, eg.
when the owner is being dragged, they can set the `this.preventShow`
variable to `true`.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-TooltipBase-destroy"></span>

### destroy ()

``` programlisting

destroy ();
```

Destroys the tooltip.

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tooltips-TooltipBase.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-TooltipBase--item"></span>

### The `“item”` property

``` programlisting
  “item”                     Clutter.Actor
```

The object owning the tooltip.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-TooltipBase--visible"></span>

### The `“visible”` property

``` programlisting
  “visible”                  boolean
```

Whether the tooltip is currently visible

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-TooltipBase--preventShow"></span>

### The `“preventShow”` property

``` programlisting
  “preventShow”              boolean
```

Whether to inhibit the display of the tooltip

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tooltips-TooltipBase--mousePosition"></span>

### The `“mousePosition”` property

``` programlisting
  “mousePosition”            array
```

The coordinates of the event that triggered the show.

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
