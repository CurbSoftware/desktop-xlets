|                                                                                                                                                               |                                                                        |                                                                      |                                                                          |                                                                          |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-InfoOSD.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-InfoOSD.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-InfoOSD.properties"  
 class="shortcut">Properties</a></span>                                                                                                                         | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                 width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-modalDialog-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                          src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>   | <a href="cinnamon-js-ui-modalDialog-NotifyDialog.html"                   
                                                                                                                                                                                                                                                                                                                 accesskey="p"><img src="left.png" data-border="0" width="16" height="16"  
                                                                                                                                                                                                                                                                                                                 alt="Prev" /></a>                                                         | <a href="cinnamon-js-ui-panel-section.html" accesskey="n"><img           
                                                                                                                                                                                                                                                                                                                                                                                            src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-modalDialog-InfoOSD"></span>

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
<td data-valign="top"><h2 id="modaldialog.infoosd"><span
class="refentrytitle"><span
id="cinnamon-js-ui-modalDialog-InfoOSD.top_of_page"></span>ModalDialog.InfoOSD</span></h2>
<p>ModalDialog.InfoOSD — An OSD that displays information to
users</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                            |
|-----------------------------------|--------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-_init"     
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>               |
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-show"      
                                     class="link" title="show ()">show</a> <span class="c_punctuation">()</span>                 |
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-hide"      
                                     class="link" title="hide ()">hide</a> <span class="c_punctuation">()</span>                 |
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-destroy"   
                                     class="link" title="destroy ()">destroy</a> <span class="c_punctuation">()</span>           |
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-addText"   
                                     class="link" title="addText ()">addText</a> <span class="c_punctuation">()</span>           |
| <span class="returnvalue"></span> | <a                                                                                         
                                     href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-addActor"  
                                     class="link" title="addActor ()">addActor</a> <span class="c_punctuation">()</span>         |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.properties"></span>

## Properties

<div class="informaltable">

|                                        |                                                                                          |     |
|----------------------------------------|------------------------------------------------------------------------------------------|-----|
| <span class="type">St.BoxLayout</span> | <a                                                                                       
                                          href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD--actor"  
                                          class="link" title="The “actor” property">actor</a>                                       |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── ModalDialog.InfoOSD
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.description"></span>

## Description

Creates an OSD to show information to user at the center of the screen.
Can display texts or a general `St.Widget`. This is useful as "hints" to
the user, eg. the popup shown when the user clicks the "Add panel"
button to guide them how to add a panel.

This does not destroy itself, and the caller of this is responsible for
destroying it after usage (via the <a
href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-destroy"
class="link" title="destroy ()"><code class="code">destroy</code></a>
function), or hiding it with <a
href="cinnamon-js-ui-modalDialog-InfoOSD.html#cinnamon-js-ui-modalDialog-InfoOSD-hide"
class="link" title="hide ()"><code class="code">hide</code></a> for
later reuse.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-_init"></span>

### \_init ()

``` programlisting

_init (string   text);
```

Constructor function. Creates an OSD and adds it to the chrome. Adds a
label with text `text` if specified.

<div class="refsect3">

<span id="id-1.2.14.5.7.2.5"></span>

#### Parameters

<div class="informaltable">

|      |                                       |     |
|------|---------------------------------------|-----|
| text | (optional) Text to display on the OSD |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-show"></span>

### show ()

``` programlisting

show (int   monitorIndex);
```

Shows the OSD at the center of monitor `monitorIndex`. Shows at the
primary monitor if not specified.

<div class="refsect3">

<span id="id-1.2.14.5.7.3.5"></span>

#### Parameters

<div class="informaltable">

|              |                                                                  |     |
|--------------|------------------------------------------------------------------|-----|
| monitorIndex | (optional) Monitor to display OSD on. Default is primary monitor |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-hide"></span>

### hide ()

``` programlisting

hide ();
```

Hides the OSD.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-destroy"></span>

### destroy ()

``` programlisting

destroy ();
```

Destroys the OSD

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-addText"></span>

### addText ()

``` programlisting

addText (string   text,
         JSON     params);
```

Adds a text label displaying `text` to the OSD

<div class="refsect3">

<span id="id-1.2.14.5.7.6.5"></span>

#### Parameters

<div class="informaltable">

|        |                                        |     |
|--------|----------------------------------------|-----|
| text   | text to display                        |     |
| params | parameters to be used when adding text |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD-addActor"></span>

### addActor ()

``` programlisting

addActor (St.Widget   actor,
          JSON        params);
```

Adds the actor `actor` to the OSD

<div class="refsect3">

<span id="id-1.2.14.5.7.7.5"></span>

#### Parameters

<div class="informaltable">

|        |                                         |     |
|--------|-----------------------------------------|-----|
| actor  | actor to add                            |     |
| params | parameters to be used when adding actor |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-InfoOSD.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-InfoOSD--actor"></span>

### The `“actor”` property

``` programlisting
  “actor”                    St.BoxLayout
```

actor of the OSD

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
