|                                                                                                                                                                  |                                                                        |                                                                     |                                                                         |                                                               |
|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupSubMenu.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupSubMenu.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupSubMenu.properties"  
 class="shortcut">Properties</a></span>                                                                                                                            | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                    width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-popupMenu-section.html" accesskey="u"><img  
                                                                                                                                                                                                                                             src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupMenu.html" accesskey="p"><img    
                                                                                                                                                                                                                                                                                                                   src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupMenuSection.html"      
                                                                                                                                                                                                                                                                                                                                                                                             accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                                             height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu"></span>

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
<td data-valign="top"><h2 id="popupmenu.popupsubmenu"><span
class="refentrytitle"><span
id="cinnamon-js-ui-popupMenu-PopupSubMenu.top_of_page"></span>PopupMenu.PopupSubMenu</span></h2>
<p>PopupMenu.PopupSubMenu — A submenu that can show and hide</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                               |
|-----------------------------------|-----------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                            
                                     href="cinnamon-js-ui-popupMenu-PopupSubMenu.html#cinnamon-js-ui-popupMenu-PopupSubMenu-_init"  
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                  |
| <span class="returnvalue"></span> | <a                                                                                            
                                     href="cinnamon-js-ui-popupMenu-PopupSubMenu.html#cinnamon-js-ui-popupMenu-PopupSubMenu-open"   
                                     class="link" title="open ()">open</a> <span class="c_punctuation">()</span>                    |
| <span class="returnvalue"></span> | <a                                                                                            
                                     href="cinnamon-js-ui-popupMenu-PopupSubMenu.html#cinnamon-js-ui-popupMenu-PopupSubMenu-close"  
                                     class="link" title="close ()">close</a> <span class="c_punctuation">()</span>                  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.properties"></span>

## Properties

<div class="informaltable">

|                                         |                                                                                                |     |
|-----------------------------------------|------------------------------------------------------------------------------------------------|-----|
| <span class="type">St.ScrollView</span> | <a                                                                                             
                                           href="cinnamon-js-ui-popupMenu-PopupSubMenu.html#cinnamon-js-ui-popupMenu-PopupSubMenu--actor"  
                                           class="link" title="The “actor” property">actor</a>                                             |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── PopupMenu.PopupMenuBase
        ╰── PopupMenu.PopupSubMenu
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.description"></span>

## Description

A submenu to be included in
<a href="cinnamon-js-ui-popupMenu-PopupMenu.html" class="link"
title="PopupMenu.PopupMenu"><code class="code">PopupMenus</code></a>/<a href="cinnamon-js-ui-popupMenu-PopupMenuSection.html" class="link"
title="PopupMenu.PopupMenuSection"><code
class="code">PopupMenuSections</code></a>. You usually don't want to
create these manually. Instead you want to create a
`PopupSubMenuMenuItem`, which creates a
<a href="cinnamon-js-ui-popupMenu-PopupSubMenu.html" class="link"
title="PopupMenu.PopupSubMenu"><code
class="code">PopupSubMenu</code></a>, and shows/hides the menu when
clicked.

Since submenus are usually used to hide long lists of things, they are
automatically put into a `St.ScrollView` such that their height will be
limited by the css max-height property.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu-_init"></span>

### \_init ()

``` programlisting

_init (St.Widget   sourceActor,
       St.Icon     sourceArrow);
```

<div class="refsect3">

<span id="id-1.2.16.7.7.2.4"></span>

#### Parameters

<div class="informaltable">

|             |                                                                                                                                                                         |     |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| sourceActor | the actor that owns the popup menu                                                                                                                                      |     |
| sourceArrow | (optional) a little arrow object inside the `PopupSubMenuMenuItem`. When the submenu opens, the arrow is rotated by pi/2 clockwise to denote the status of the submenu. |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu-open"></span>

### open ()

``` programlisting

open (boolean   animate);
```

Opens the submenu

<div class="refsect3">

<span id="id-1.2.16.7.7.3.5"></span>

#### Parameters

<div class="informaltable">

|         |                                     |     |
|---------|-------------------------------------|-----|
| animate | whether the animate the open effect |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu-close"></span>

### close ()

``` programlisting

close (boolean   animate);
```

Closes the submenu

<div class="refsect3">

<span id="id-1.2.16.7.7.4.5"></span>

#### Parameters

<div class="informaltable">

|         |                                      |     |
|---------|--------------------------------------|-----|
| animate | whether the animate the close effect |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupSubMenu--actor"></span>

### The `“actor”` property

``` programlisting
  “actor”                    St.ScrollView
```

The actor of the submenu.

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
