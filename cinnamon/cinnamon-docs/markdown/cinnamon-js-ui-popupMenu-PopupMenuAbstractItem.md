|                                                                                                                                                                     |                                                                        |                                                                     |                                                                          |                                                                          |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupMenuAbstractItem.description" 
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a                                                                    
 href="#cinnamon-js-ui-popupMenu-PopupMenuAbstractItem.object-hierarchy"                                                                                              
 class="shortcut">Object Hierarchy</a></span>                                                                                                                         | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                       width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-popupMenu-section.html" accesskey="u"><img  
                                                                                                                                                                                                                                                src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupIndicatorMenuItem.html"           
                                                                                                                                                                                                                                                                                                                      accesskey="p"><img src="left.png" data-border="0" width="16" height="16"  
                                                                                                                                                                                                                                                                                                                      alt="Prev" /></a>                                                         | <a href="cinnamon-js-ui-popupMenu-PopupMenuBase.html" accesskey="n"><img 
                                                                                                                                                                                                                                                                                                                                                                                                 src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-popupMenu-PopupMenuAbstractItem"></span>

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
<td data-valign="top"><h2 id="popupmenu.popupmenuabstractitem"><span
class="refentrytitle"><span
id="cinnamon-js-ui-popupMenu-PopupMenuAbstractItem.top_of_page"></span>PopupMenu.PopupMenuAbstractItem</span></h2>
<p>PopupMenu.PopupMenuAbstractItem — A class to represent any abstract
menu item.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupMenuAbstractItem.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── PopupMenu.PopupMenuAbstractItem
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupMenuAbstractItem.description"></span>

## Description

This is an abstract class for create a binding between the PopupMenuItem
class , and an abstract representation of a menu item. If you want to
create a cinnamon menu structure, you need to inherit from this class
and implement the functions getItemById and handleEvent. All instances
of this class need to have a unique id to represent a menu item.

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
