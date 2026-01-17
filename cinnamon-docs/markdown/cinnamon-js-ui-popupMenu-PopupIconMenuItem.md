|                                                                                                                                                                       |                                                                        |                                                                     |                                                                         |                                                                |
|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupIconMenuItem.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupIconMenuItem.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span>                                                                                                                           | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                         width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-popupMenu-section.html" accesskey="u"><img  
                                                                                                                                                                                                                                                  src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-popupMenu-section.html" accesskey="p"><img      
                                                                                                                                                                                                                                                                                                                        src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupIndicatorMenuItem.html" 
                                                                                                                                                                                                                                                                                                                                                                                                  accesskey="n"><img src="right.png" data-border="0" width="16"   
                                                                                                                                                                                                                                                                                                                                                                                                  height="16" alt="Next" /></a>                                   |

<div class="refentry">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem"></span>

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
<td data-valign="top"><h2 id="popupmenu.popupiconmenuitem"><span
class="refentrytitle"><span
id="cinnamon-js-ui-popupMenu-PopupIconMenuItem.top_of_page"></span>PopupMenu.PopupIconMenuItem</span></h2>
<p>PopupMenu.PopupIconMenuItem — A menu item with an icon and a
text.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                                       |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-popupMenu-PopupIconMenuItem.html#cinnamon-js-ui-popupMenu-PopupIconMenuItem-_init"                
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                                          |
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-popupMenu-PopupIconMenuItem.html#cinnamon-js-ui-popupMenu-PopupIconMenuItem-setIconSymbolicName"  
                                     class="link" title="setIconSymbolicName ()">setIconSymbolicName</a> <span class="c_punctuation">()</span>              |
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-popupMenu-PopupIconMenuItem.html#cinnamon-js-ui-popupMenu-PopupIconMenuItem-setIconName"          
                                     class="link" title="setIconName ()">setIconName</a> <span class="c_punctuation">()</span>                              |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── PopupMenu.PopupIconMenuItem
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem.description"></span>

## Description

This is a popup menu item displaying an icon and a text. The icon is
displayed to the left of the text. `PopupImageMenuItem` is a similar,
deprecated item, that displays the icon to the right of the text, which
is ugly in most cases. Do not use it. If you think you need to display
the icon on the right, make your own menu item (by copy and pasting the
code found below) because PopupImageMenuItem is deprecated and may
disappear any time.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem-_init"></span>

### \_init ()

``` programlisting

_init (string        text,
       string        iconName,
       St.IconType   iconType,
       JSON          params);
```

<div class="refsect3">

<span id="id-1.2.16.2.6.2.4"></span>

#### Parameters

<div class="informaltable">

|          |                                                                              |     |
|----------|------------------------------------------------------------------------------|-----|
| text     | text to display in the label                                                 |     |
| iconName | name of the icon used                                                        |     |
| iconType | the type of icon (usually `St.IconType`.SYMBOLIC or `St.IconType`.FULLCOLOR) |     |
| params   | parameters to pass to `PopupMenu.PopupBaseMenuItem._init`                    |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem-setIconSymbolicName"></span>

### setIconSymbolicName ()

``` programlisting

setIconSymbolicName (string   iconName);
```

Changes the icon to a symbolic icon with name `iconName`.

<div class="refsect3">

<span id="id-1.2.16.2.6.3.5"></span>

#### Parameters

<div class="informaltable">

|          |                  |     |
|----------|------------------|-----|
| iconName | name of the icon |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-popupMenu-PopupIconMenuItem-setIconName"></span>

### setIconName ()

``` programlisting

setIconName (string   iconName);
```

Changes the icon to a full color icon with name `iconName`.

<div class="refsect3">

<span id="id-1.2.16.2.6.4.5"></span>

#### Parameters

<div class="informaltable">

|          |                  |     |
|----------|------------------|-----|
| iconName | name of the icon |     |

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
