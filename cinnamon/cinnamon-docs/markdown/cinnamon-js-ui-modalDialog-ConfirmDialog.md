|                                                                                                                                                                     |                                                                        |                                                                      |                                                                          |                                                               |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ConfirmDialog.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ConfirmDialog.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ConfirmDialog.properties"  
 class="shortcut">Properties</a></span>                                                                                                                               | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                       width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-modalDialog-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                                src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>   | <a href="cinnamon-js-ui-modalDialog-ModalDialog.html" accesskey="p"><img 
                                                                                                                                                                                                                                                                                                                       src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>   | <a href="cinnamon-js-ui-modalDialog-NotifyDialog.html"        
                                                                                                                                                                                                                                                                                                                                                                                                  accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                                                  height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog"></span>

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
<td data-valign="top"><h2 id="modaldialog.confirmdialog"><span
class="refentrytitle"><span
id="cinnamon-js-ui-modalDialog-ConfirmDialog.top_of_page"></span>ModalDialog.ConfirmDialog</span></h2>
<p>ModalDialog.ConfirmDialog — A simple dialog with a "Yes" and "No"
button.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                     |
|-----------------------------------|-----------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                  
                                     href="cinnamon-js-ui-modalDialog-ConfirmDialog.html#cinnamon-js-ui-modalDialog-ConfirmDialog-_init"  
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                        |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.properties"></span>

## Properties

<div class="informaltable">

|                                    |                                                                                                         |     |
|------------------------------------|---------------------------------------------------------------------------------------------------------|-----|
| <span class="type">function</span> | <a                                                                                                      
                                      href="cinnamon-js-ui-modalDialog-ConfirmDialog.html#cinnamon-js-ui-modalDialog-ConfirmDialog--callback"  
                                      class="link" title="The “callback” property">callback</a>                                                |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── ModalDialog.ModalDialog
        ╰── ModalDialog.ConfirmDialog
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.description"></span>

## Description

A confirmation dialog that calls `callback` and then destroys itself if
user clicks "Yes". If the user clicks "No", the dialog simply destroys
itself.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog-_init"></span>

### \_init ()

``` programlisting

_init (string     description,
       function   callback);
```

Constructor function.

<div class="refsect3">

<span id="id-1.2.14.3.7.2.5"></span>

#### Parameters

<div class="informaltable">

|             |                                         |     |
|-------------|-----------------------------------------|-----|
| description | label to display on the confirm dialog  |     |
| callback    | function to call when user clicks "yes" |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ConfirmDialog--callback"></span>

### The `“callback”` property

``` programlisting
  “callback”                 function
```

Callback when "Yes" is clicked

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
