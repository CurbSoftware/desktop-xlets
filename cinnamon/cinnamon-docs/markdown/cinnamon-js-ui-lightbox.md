|                                      |                                                                        |                                                                     |                                                                         |                                                                          |
|:-------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a> | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                        width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-lightbox-section.html" accesskey="u"><img   
                                                                                                                 src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-lightbox-section.html" accesskey="p"><img       
                                                                                                                                                                                       src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-magnifierDBus-section.html" accesskey="n"><img   
                                                                                                                                                                                                                                                                 src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-lightbox"></span>

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
<td data-valign="top"><h2 id="lightbox"><span
class="refentrytitle"><span
id="cinnamon-js-ui-lightbox.top_of_page"></span>Lightbox</span></h2>
<p>Lightbox</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-lightbox.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                     |
|-----------------------------------|-------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-lightbox.html#cinnamon-js-ui-lightbox-Lightbox"             
                                     class="link" title="Lightbox ()">Lightbox</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-lightbox.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-lightbox-Lightbox"></span>

### Lightbox ()

``` programlisting

Lightbox (container,
          params);
```

Lightbox creates a dark translucent "shade" actor to hide the contents
of `container`, and allows you to specify particular actors in
`container` to highlight by bringing them above the shade. It tracks
added and removed actors in `container` while the lightboxing is active,
and ensures that all actors are returned to their original stacking
order when the lightboxing is removed. (However, if actors are restacked
by outside code while the lightboxing is active, the lightbox may later
revert them back to their original order.)

By default, the shade window will have the height and width of
`container` and will track any changes in its size. You can override
this by passing an explicit width and height in `params`.

<div class="refsect3">

<span id="id-1.2.10.2.4.2.6"></span>

#### Parameters

<div class="informaltable">

<table class="informaltable" width="100%" data-border="0">
<tbody>
<tr class="odd">
<td class="parameter_name"><p>container</p></td>
<td class="parameter_description"><p>parent Clutter.Container</p></td>
<td class="parameter_annotations"> </td>
</tr>
<tr class="even">
<td class="parameter_name"><p>params</p></td>
<td class="parameter_description"><p>(optional) additional
parameters:</p>
<div class="itemizedlist">
<ul>
<li><p>inhibitEvents: whether to inhibit events for <code
class="code">container</code></p></li>
<li><p>width: shade actor width</p></li>
<li><p>height: shade actor height</p></li>
<li><p>fadeTime: seconds used to fade in/out</p></li>
</ul>
</div></td>
<td class="parameter_annotations"> </td>
</tr>
</tbody>
</table>

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
