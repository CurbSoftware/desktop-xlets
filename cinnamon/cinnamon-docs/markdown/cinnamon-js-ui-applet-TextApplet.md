|                                                                                                                                                             |                                                                        |                                                                     |                                                                         |                                                                          |
|:------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-TextApplet.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-TextApplet.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-applet-TextApplet.properties"  
 class="shortcut">Properties</a></span>                                                                                                                       | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                               width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-applet-section.html" accesskey="u"><img     
                                                                                                                                                                                                                                        src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-applet-IconApplet.html" accesskey="p"><img      
                                                                                                                                                                                                                                                                                                              src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-applet-TextIconApplet.html" accesskey="n"><img   
                                                                                                                                                                                                                                                                                                                                                                                        src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-applet-TextApplet"></span>

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
<td data-valign="top"><h2 id="applet.textapplet"><span
class="refentrytitle"><span
id="cinnamon-js-ui-applet-TextApplet.top_of_page"></span>Applet.TextApplet</span></h2>
<p>Applet.TextApplet — Applet with label</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                     |
|-----------------------------------|-----------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                  
                                     href="cinnamon-js-ui-applet-TextApplet.html#cinnamon-js-ui-applet-TextApplet-_init"                  
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                        |
| <span class="returnvalue"></span> | <a                                                                                                  
                                     href="cinnamon-js-ui-applet-TextApplet.html#cinnamon-js-ui-applet-TextApplet-set_applet_label"       
                                     class="link" title="set_applet_label ()">set_applet_label</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.properties"></span>

## Properties

<div class="informaltable">

|                                    |                                                                                              |     |
|------------------------------------|----------------------------------------------------------------------------------------------|-----|
| <span class="type">St.Label</span> | <a                                                                                           
                                      href="cinnamon-js-ui-applet-TextApplet.html#cinnamon-js-ui-applet-TextApplet--_applet_label"  
                                      class="link" title="The “_applet_label” property">_applet_label</a>                           |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Applet.Applet
        ╰── Applet.TextApplet
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.description"></span>

## Description

Applet that displays a text

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-applet-TextApplet-_init"></span>

### \_init ()

``` programlisting

_init (St.Side   orientation,
       int       panelHeight,
       int       instance_id);
```

Note that suitability for display in a vertical panel is handled by
having applets declare they work OK, handled elsewhere

<div class="refsect3">

<span id="id-1.2.1.7.7.2.5"></span>

#### Parameters

<div class="informaltable">

|             |                                                                      |     |
|-------------|----------------------------------------------------------------------|-----|
| orientation | orientation of the applet; Orientation of panel containing the actor |     |
| panelHeight | height of the panel containing the applet                            |     |
| instance_id | instance id of the applet                                            |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-applet-TextApplet-set_applet_label"></span>

### set_applet_label ()

``` programlisting

set_applet_label (string   text);
```

Sets the text of the actor to `text`

<div class="refsect3">

<span id="id-1.2.1.7.7.3.5"></span>

#### Parameters

<div class="informaltable">

|      |                                   |     |
|------|-----------------------------------|-----|
| text | text to be displayed at the label |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-applet-TextApplet.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-applet-TextApplet--_applet_label"></span>

### The `“_applet_label”` property

``` programlisting
  “_applet_label”            St.Label
```

Label of the applet

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
