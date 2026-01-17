|                                                                                                                                                                      |                                                                        |                                                                     |                                                                         |                                                               |
|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupMenuSection.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-popupMenu-PopupMenuSection.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span>                                                                                                                          | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                        width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-popupMenu-section.html" accesskey="u"><img  
                                                                                                                                                                                                                                                 src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupSubMenu.html" accesskey="p"><img 
                                                                                                                                                                                                                                                                                                                       src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-popupMenu-PopupMenuFactory.html"      
                                                                                                                                                                                                                                                                                                                                                                                                 accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                                                 height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-popupMenu-PopupMenuSection"></span>

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
<td data-valign="top"><h2 id="popupmenu.popupmenusection"><span
class="refentrytitle"><span
id="cinnamon-js-ui-popupMenu-PopupMenuSection.top_of_page"></span>PopupMenu.PopupMenuSection</span></h2>
<p>PopupMenu.PopupMenuSection — A section of a <a
href="cinnamon-js-ui-popupMenu-PopupMenu.html" class="link"
title="PopupMenu.PopupMenu"><code class="code">PopupMenu</code></a> that
is transparent to user</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupMenuSection.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── PopupMenu.PopupMenuBase
        ╰── PopupMenu.PopupMenuSection
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-popupMenu-PopupMenuSection.description"></span>

## Description

A section of a PopupMenu which is handled like a submenu (you can add
and remove items, you can destroy it, you can add it to another menu),
but is completely transparent to the user. This is helpful for grouping
things together so that you can manage them in bulk. A common use case
might be to let an object inherit a
<a href="cinnamon-js-ui-popupMenu-PopupMenuSection.html" class="link"
title="PopupMenu.PopupMenuSection"><code
class="code">PopupMenuSection</code></a> and then add the whole object
to a popup menu.

Note that you cannot close a
<a href="cinnamon-js-ui-popupMenu-PopupMenuSection.html" class="link"
title="PopupMenu.PopupMenuSection"><code
class="code">PopupMenuSection</code></a>.

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
