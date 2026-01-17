|                                                                                                                                           |                                                                        |                                                                     |                                                                         |                                                                          |
|:------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-panel.description" 
 class="shortcut">Description</a></span>                                                                                                    | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                             width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-panel-section.html" accesskey="u"><img      
                                                                                                                                                                                                                      src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-panel-section.html" accesskey="p"><img          
                                                                                                                                                                                                                                                                                            src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-panel-PanelManager.html" accesskey="n"><img      
                                                                                                                                                                                                                                                                                                                                                                      src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-panel"></span>

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
<td data-valign="top"><h2 id="panel"><span class="refentrytitle"><span
id="cinnamon-js-ui-panel.top_of_page"></span>Panel</span></h2>
<p>Panel — The file responsible for managing panels</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-panel.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                           |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                        
                                     href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-checkPanelUpgrade"                                    
                                     class="link" title="checkPanelUpgrade ()">checkPanelUpgrade</a> <span class="c_punctuation">()</span>      |
| <span class="returnvalue"></span> | <a                                                                                                        
                                     href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-heightsUsedMonitor"                                   
                                     class="link" title="heightsUsedMonitor ()">heightsUsedMonitor</a> <span class="c_punctuation">()</span>    |
| <span class="returnvalue"></span> | <a                                                                                                        
                                     href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-getPanelLocFromName"                                  
                                     class="link" title="getPanelLocFromName ()">getPanelLocFromName</a> <span class="c_punctuation">()</span>  |
| <span class="returnvalue"></span> | <a                                                                                                        
                                     href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-toStandardIconSize"                                   
                                     class="link" title="toStandardIconSize ()">toStandardIconSize</a> <span class="c_punctuation">()</span>    |
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-PanelCorner"                                      
                                     class="link" title="PanelCorner ()">PanelCorner</a> <span class="c_punctuation">()</span>                  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-panel.description"></span>

## Description

This file is where everything about panels happens.
<a href="cinnamon-js-ui-main.html" class="link" title="Main"><code
class="code">Main</code></a> will create a
<a href="cinnamon-js-ui-panel-PanelManager.html" class="link"
title="Panel.PanelManager"><code class="code">PanelManager</code></a>
object, which is responsible for creating and moving panels. There is
also a <a
href="cinnamon-js-ui-panel.html#cinnamon-js-ui-panel-checkPanelUpgrade"
class="link" title="checkPanelUpgrade ()"><code
class="code">checkPanelUpgrade</code></a> function used as a transition
between the old panel settings and the new panel settings.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-panel.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-panel-checkPanelUpgrade"></span>

### checkPanelUpgrade ()

``` programlisting

checkPanelUpgrade ();
```

Run from main, prior to PanelManager being initialized this handles the
one-time transition between panel implementations to make this
transition invisible to the user. We will evaluate the desktop-layout
key, and pre-set applets-enabled and panels-enabled appropriately.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-panel-heightsUsedMonitor"></span>

### heightsUsedMonitor ()

``` programlisting

heightsUsedMonitor (integer   monitorIndex,
                    array     listofpanels);
```

Retrieves the heights used in horizontal panels on the monitor to that
vertical panels can be sized and positioned not to overlap them

<div class="refsect3">

<span id="id-1.2.15.2.5.3.5"></span>

#### Parameters

<div class="informaltable">

|              |                  |     |
|--------------|------------------|-----|
| monitorIndex | index of monitor |     |
| listofpanels | array of panels  |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.15.2.5.3.6"></span>

#### Returns

a two element array

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-panel-getPanelLocFromName"></span>

### getPanelLocFromName ()

``` programlisting

getPanelLocFromName (char   pname);
```

get the panel numeric type from its name in settings

returns - panel type (integer)

<div class="refsect3">

<span id="id-1.2.15.2.5.4.6"></span>

#### Parameters

<div class="informaltable">

|       |            |     |
|-------|------------|-----|
| pname | panel type |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-panel-toStandardIconSize"></span>

### toStandardIconSize ()

``` programlisting

toStandardIconSize (integer   maxSize);
```

Calculates the nearest standard icon size up to a maximum.

<div class="refsect3">

<span id="id-1.2.15.2.5.5.5"></span>

#### Parameters

<div class="informaltable">

|         |                              |     |
|---------|------------------------------|-----|
| maxSize | the maximum size of the icon |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.15.2.5.5.6"></span>

#### Returns

an integer, the icon size

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-panel-PanelCorner"></span>

### PanelCorner ()

``` programlisting

PanelCorner (box,
             side,
             cornertype);
```

Sets up a panel corner

The panel corners are there for a non-obvious reason. They are used as
the positioning points for small drawing areas that use some optional
css to draw small filled arcs (in the repaint function). This allows
windows with rounded corners to be blended into the panels in some
distros, gnome shell in particular. In mint tiling and full screen
removes any rounded window corners anyway, so this optional css is not
there in the main mint themes, and the corner/cairo functionality is
unused in this case. Where the corners are used they will be positioned
so as to fill in the tiny gap at the corners of full screen windows, and
if themed right they will be invisible to the user, other than the
window will appear to go right up to the corner when full screen

<div class="refsect3">

<span id="id-1.2.15.2.5.6.6"></span>

#### Parameters

<div class="informaltable">

|            |                                                                                |     |
|------------|--------------------------------------------------------------------------------|-----|
| box        | the box in a panel the corner is associated with                               |     |
| side       | the side of the box a text or icon/text applet starts from (RTL or LTR driven) |     |
| cornertype | top left, bottom right etc.                                                    |     |

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
