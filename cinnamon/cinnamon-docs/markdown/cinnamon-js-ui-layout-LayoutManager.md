|                                                                                                                                                                |                                                                        |                                                                     |                                                                         |                                                                          |
|:---------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-layout-LayoutManager.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-layout-LayoutManager.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span>                                                                                                                    | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                  width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-layout-section.html" accesskey="u"><img     
                                                                                                                                                                                                                                           src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-layout-section.html" accesskey="p"><img         
                                                                                                                                                                                                                                                                                                                 src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-lightbox-section.html" accesskey="n"><img        
                                                                                                                                                                                                                                                                                                                                                                                           src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-layout-LayoutManager"></span>

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
<td data-valign="top"><h2 id="layout.layoutmanager"><span
class="refentrytitle"><span
id="cinnamon-js-ui-layout-LayoutManager.top_of_page"></span>Layout.LayoutManager</span></h2>
<p>Layout.LayoutManager — Manager of Cinnamon Chrome</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-layout-LayoutManager.functions"></span>

## Functions

<div class="informaltable">

|                                                 |                                                                                                              |
|-------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span>               | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-updateChrome"              
                                                   class="link" title="updateChrome ()">updateChrome</a> <span class="c_punctuation">()</span>                   |
| <span class="returnvalue"></span>               | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-addChrome"                 
                                                   class="link" title="addChrome ()">addChrome</a> <span class="c_punctuation">()</span>                         |
| <span class="returnvalue"></span>               | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-trackChrome"               
                                                   class="link" title="trackChrome ()">trackChrome</a> <span class="c_punctuation">()</span>                     |
| <span class="returnvalue"></span>               | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-untrackChrome"             
                                                   class="link" title="untrackChrome ()">untrackChrome</a> <span class="c_punctuation">()</span>                 |
| <span class="returnvalue"></span>               | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-removeChrome"              
                                                   class="link" title="removeChrome ()">removeChrome</a> <span class="c_punctuation">()</span>                   |
| <span class="returnvalue">Layout.Monitor</span> | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-findMonitorForActor"       
                                                   class="link" title="findMonitorForActor ()">findMonitorForActor</a> <span class="c_punctuation">()</span>     |
| <span class="returnvalue">number</span>         | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-findMonitorIndexForActor"  
                                                   class="link"                                                                                                  
                                                   title="findMonitorIndexForActor ()">findMonitorIndexForActor</a> <span class="c_punctuation">()</span>        |
| <span class="returnvalue">boolean</span>        | <a                                                                                                           
                                                   href="cinnamon-js-ui-layout-LayoutManager.html#cinnamon-js-ui-layout-LayoutManager-isTrackingChrome"          
                                                   class="link" title="isTrackingChrome ()">isTrackingChrome</a> <span class="c_punctuation">()</span>           |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-layout-LayoutManager.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Layout.LayoutManager
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-layout-LayoutManager.description"></span>

## Description

Creates and manages the Chrome container which holds all of the Cinnamon
UI actors.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-layout-LayoutManager.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-updateChrome"></span>

### updateChrome ()

``` programlisting

updateChrome (boolean   doVisibility);
```

Updates input region and struts for all chrome actors. If `doVisibility`
is true, then the visibility state of all chrome actors is recalculated
first.

Use with care as this is already frequently updated, and can reduce
performance if called unnecessarily.

<div class="refsect3">

<span id="id-1.2.9.2.6.2.6"></span>

#### Parameters

<div class="informaltable">

|              |                                               |     |
|--------------|-----------------------------------------------|-----|
| doVisibility | (optional) whether to recalculate visibility. |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-addChrome"></span>

### addChrome ()

``` programlisting

addChrome (Clutter.Actor   actor,
           object          params);
```

Adds `actor` to the chrome, and (unless `affectsInputRegion` in `params`
is `false`) extends the input region to include it. Changes in `actor`'s
size, position, and visibility will automatically result in appropriate
changes to the input region.

If `affectsStruts` in `params` is `true` (and `actor` is along a screen
edge), then `actor`'s size and position will also affect the window
manager struts. Changes to `actor`'s visibility will NOT affect whether
or not the strut is present, however.

If `visibleInFullscreen` in `params` is `true`, the actor will be
visible even when a fullscreen window should be covering it.

<div class="refsect3">

<span id="id-1.2.9.2.6.3.7"></span>

#### Parameters

<div class="informaltable">

<table class="informaltable" width="100%" data-border="0">
<tbody>
<tr class="odd">
<td class="parameter_name"><p>actor</p></td>
<td class="parameter_description"><p>an actor to add to the
chrome</p></td>
<td class="parameter_annotations"> </td>
</tr>
<tr class="even">
<td class="parameter_name"><p>params</p></td>
<td class="parameter_description"><p>(optional) additional params</p>
<div class="itemizedlist">
<ul>
<li><p>visibleInFullcreen (boolean): The actor should be hidden when a
window on the same monitor is fullscreen. Default <code
class="code">false</code>.</p></li>
<li><p>affectsStruts (boolean): The actor's allocation should be used to
add window manager struts. Default <code
class="code">false</code>.</p></li>
<li><p>affectsInputRegion (boolean): The actor should be added to the
stage input region. Default <code class="code">true</code>.</p></li>
<li><p>addToWindowgroup (boolean): The actor should be added as a
top-level window. Default <code class="code">false</code>.</p></li>
<li><p>doNotAdd (boolean): The actor should not be added to the uiGroup.
This has no effect if <code class="code">addToWindowgroup</code> is
<code class="code">true</code>. Default <code
class="code">false</code>.</p></li>
</ul>
</div></td>
<td class="parameter_annotations"> </td>
</tr>
</tbody>
</table>

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-trackChrome"></span>

### trackChrome ()

``` programlisting

trackChrome (Clutter.Actor   actor,
             object          params);
```

Tells the chrome to track `actor`. This can be used to extend the struts
or input region to cover specific children.

`params` can have any of the same values as in addChrome(), though some
possibilities don't make sense (eg, trying to have a
`visibleInFullscreen` child of a non-`visibleInFullscreen` parent).

<div class="refsect3">

<span id="id-1.2.9.2.6.4.6"></span>

#### Parameters

<div class="informaltable">

<table class="informaltable" width="100%" data-border="0">
<tbody>
<tr class="odd">
<td class="parameter_name"><p>actor</p></td>
<td class="parameter_description"><p>a descendant of the chrome to begin
tracking</p></td>
<td class="parameter_annotations"> </td>
</tr>
<tr class="even">
<td class="parameter_name"><p>params</p></td>
<td class="parameter_description"><p>(optional) additional params -
defaults to same as chrome ancestor</p>
<div class="itemizedlist">
<ul>
<li><p>visibleInFullcreen (boolean): The actor should be hidden when a
window on the same monitor is fullscreen.</p></li>
<li><p>affectsStruts (boolean): The actor's allocation should be used to
add window manager struts.</p></li>
<li><p>affectsInputRegion (boolean): The actor should be added to the
stage input region.</p></li>
<li><p>addToWindowgroup (boolean): The actor should be added as a
top-level window.</p></li>
<li><p>doNotAdd (boolean): The actor should not be added to the uiGroup.
This has no effect if <code class="code">addToWindowgroup</code> is
<code class="code">true</code>.</p></li>
</ul>
</div></td>
<td class="parameter_annotations"> </td>
</tr>
</tbody>
</table>

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-untrackChrome"></span>

### untrackChrome ()

``` programlisting

untrackChrome (Clutter.Actor   actor);
```

Undoes the effect of trackChrome()

<div class="refsect3">

<span id="id-1.2.9.2.6.5.5"></span>

#### Parameters

<div class="informaltable">

|       |                                               |     |
|-------|-----------------------------------------------|-----|
| actor | an actor previously tracked via trackChrome() |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-removeChrome"></span>

### removeChrome ()

``` programlisting

removeChrome (Clutter.Actor   actor);
```

Removes the actor from the chrome

<div class="refsect3">

<span id="id-1.2.9.2.6.6.5"></span>

#### Parameters

<div class="informaltable">

|       |                |     |
|-------|----------------|-----|
| actor | a chrome actor |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-findMonitorForActor"></span>

### findMonitorForActor ()

``` programlisting
Layout.Monitor
findMonitorForActor (Clutter.Actor   actor);
```

Finds the monitor the actor is currently located on. If the actor is not
found the primary monitor is returned.

<div class="refsect3">

<span id="id-1.2.9.2.6.7.5"></span>

#### Parameters

<div class="informaltable">

|       |                     |     |
|-------|---------------------|-----|
| actor | the actor to locate |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.9.2.6.7.6"></span>

#### Returns

the monitor

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-findMonitorIndexForActor"></span>

### findMonitorIndexForActor ()

``` programlisting
number
findMonitorIndexForActor (Clutter.Actor   actor);
```

Finds the index of the monitor the actor is currently located on. If the
actor is not found the primary monitor index is returned.

<div class="refsect3">

<span id="id-1.2.9.2.6.8.5"></span>

#### Parameters

<div class="informaltable">

|       |                     |     |
|-------|---------------------|-----|
| actor | the actor to locate |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.9.2.6.8.6"></span>

#### Returns

the monitor index

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-layout-LayoutManager-isTrackingChrome"></span>

### isTrackingChrome ()

``` programlisting
boolean
isTrackingChrome (Clutter.Actor   actor);
```

Determines whether the actor is currently tracked or not.

<div class="refsect3">

<span id="id-1.2.9.2.6.9.5"></span>

#### Parameters

<div class="informaltable">

|       |                    |     |
|-------|--------------------|-----|
| actor | the actor to check |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.9.2.6.9.6"></span>

#### Returns

whether the actor is currently tracked

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
