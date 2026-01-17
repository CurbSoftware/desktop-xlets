|                                                                                                                                                                     |                                                                        |                                                                         |                                                                         |                                                                          |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-deskletManager-DeskletContainer.description" 
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a                                                                    
 href="#cinnamon-js-ui-deskletManager-DeskletContainer.object-hierarchy"                                                                                              
 class="shortcut">Object Hierarchy</a></span>                                                                                                                         | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                       width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-deskletManager-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                                src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>      | <a href="cinnamon-js-ui-deskletManager.html" accesskey="p"><img         
                                                                                                                                                                                                                                                                                                                          src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-dnd-section.html" accesskey="n"><img             
                                                                                                                                                                                                                                                                                                                                                                                                    src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer"></span>

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
<td data-valign="top"><h2 id="deskletmanager.deskletcontainer"><span
class="refentrytitle"><span
id="cinnamon-js-ui-deskletManager-DeskletContainer.top_of_page"></span>DeskletManager.DeskletContainer</span></h2>
<p>DeskletManager.DeskletContainer</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer.functions"></span>

## Functions

<div class="informaltable">

|                                          |                                                                                                                      |
|------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span>        | <a                                                                                                                   
                                            href="cinnamon-js-ui-deskletManager-DeskletContainer.html#cinnamon-js-ui-deskletManager-DeskletContainer-addDesklet"  
                                            class="link" title="addDesklet ()">addDesklet</a> <span class="c_punctuation">()</span>                               |
| <span class="returnvalue">boolean</span> | <a                                                                                                                   
                                            href="cinnamon-js-ui-deskletManager-DeskletContainer.html#cinnamon-js-ui-deskletManager-DeskletContainer-contains"    
                                            class="link" title="contains ()">contains</a> <span class="c_punctuation">()</span>                                   |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── DeskletManager.DeskletContainer
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer.description"></span>

## Description

Container that contains manages all desklets actors

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer-addDesklet"></span>

### addDesklet ()

``` programlisting

addDesklet (Clutter.Actor   actor);
```

Adds `actor` to the desklet container

<div class="refsect3">

<span id="id-1.2.6.3.6.2.5"></span>

#### Parameters

<div class="informaltable">

|       |                              |     |
|-------|------------------------------|-----|
| actor | actor of desklet to be added |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-deskletManager-DeskletContainer-contains"></span>

### contains ()

``` programlisting
boolean
contains (Clutter.Actor   actor);
```

Whether the desklet container contains `actor`

<div class="refsect3">

<span id="id-1.2.6.3.6.3.5"></span>

#### Parameters

<div class="informaltable">

|       |                    |     |
|-------|--------------------|-----|
| actor | actor to be tested |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.6.3.6.3.6"></span>

#### Returns

whether the desklet container contains the actor

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
