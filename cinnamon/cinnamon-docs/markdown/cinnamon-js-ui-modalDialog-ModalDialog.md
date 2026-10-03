|                                                                                                                                                                   |                                                                        |                                                                      |                                                                         |                                                               |
|:------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ModalDialog.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ModalDialog.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-modalDialog-ModalDialog.properties"  
 class="shortcut">Properties</a></span>                                                                                                                             | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                     width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-modalDialog-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                              src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>   | <a href="cinnamon-js-ui-modalDialog-section.html" accesskey="p"><img    
                                                                                                                                                                                                                                                                                                                     src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-modalDialog-ConfirmDialog.html"       
                                                                                                                                                                                                                                                                                                                                                                                               accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                                               height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-modalDialog-ModalDialog"></span>

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
<td data-valign="top"><h2 id="modaldialog.modaldialog"><span
class="refentrytitle"><span
id="cinnamon-js-ui-modalDialog-ModalDialog.top_of_page"></span>ModalDialog.ModalDialog</span></h2>
<p>ModalDialog.ModalDialog — A generic object that displays a modal
dialog</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                          |
|-----------------------------------|----------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-_init"           
                                     class="link" title="_init ()">_init</a> <span class="c_punctuation">()</span>                             |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-setButtons"      
                                     class="link" title="setButtons ()">setButtons</a> <span class="c_punctuation">()</span>                   |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-open"            
                                     class="link" title="open ()">open</a> <span class="c_punctuation">()</span>                               |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-close"           
                                     class="link" title="close ()">close</a> <span class="c_punctuation">()</span>                             |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-popModal"        
                                     class="link" title="popModal ()">popModal</a> <span class="c_punctuation">()</span>                       |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-pushModal"       
                                     class="link" title="pushModal ()">pushModal</a> <span class="c_punctuation">()</span>                     |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-_fadeOutDialog"  
                                     class="link" title="_fadeOutDialog ()">_fadeOutDialog</a> <span class="c_punctuation">()</span>           |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.properties"></span>

## Properties

<div class="informaltable">

|                                             |                                                                                                          |     |
|---------------------------------------------|----------------------------------------------------------------------------------------------------------|-----|
| <span class="type">ModalDialog.State</span> | <a                                                                                                       
                                               href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog--state"          
                                               class="link" title="The “state” property">state</a>                                                       |     |
| <span class="type">St.BoxLayout</span>      | <a                                                                                                       
                                               href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog--contentLayout"  
                                               class="link" title="The “contentLayout” property">contentLayout</a>                                       |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── ModalDialog.ModalDialog
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.description"></span>

## Description

The <a href="cinnamon-js-ui-modalDialog-ModalDialog.html" class="link"
title="ModalDialog.ModalDialog"><code
class="code">ModalDialog</code></a> object is a generic popup dialog in
Cinnamon. It can either be created directly and then manipulated
afterwards, or used as a base class for more sophisticated modal dialog.

For simple usage such as displaying a message, or asking for
confirmation, the
<a href="cinnamon-js-ui-modalDialog-ConfirmDialog.html" class="link"
title="ModalDialog.ConfirmDialog"><code
class="code">ConfirmDialog</code></a> and
<a href="cinnamon-js-ui-modalDialog-NotifyDialog.html" class="link"
title="ModalDialog.NotifyDialog"><code
class="code">NotifyDialog</code></a> classes may be used instead.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-_init"></span>

### \_init ()

``` programlisting

_init (JSON   params);
```

<div class="refsect3">

<span id="id-1.2.14.2.7.2.4"></span>

#### Parameters

<div class="informaltable">

|        |                                                                                                                                                                                                                     |     |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| params | parameters for the modal dialog. Options include `cinnamonReactive`, which determines whether the modal dialog should block Cinnamon input, and `styleClass`, which is the style class the modal dialog should use. |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-setButtons"></span>

### setButtons ()

``` programlisting

setButtons (array   buttons);
```

This sets the buttons in the modal dialog. The buttons is an array of
JSON objects, each of which corresponds to one button.

Each JSON object <span class="emphasis">*must*</span> contain `label`
and `action`, which are the text displayed on the button and the
callback function to use when the button is clicked respectively.

Optional arguments include `focused`, which determines whether the
button is initially focused, and `key`, which is a keybinding associated
with the button press such that pressing the keybinding will have the
same effect as clicking the button. Other arguments include `default`
and `destructive_action` which add additional styling.

An example usage is

<div class="informalexample">

<table class="listing_frame" data-border="0" data-cellpadding="0"
data-cellspacing="0">
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td class="listing_lines" style="text-align: right;"><pre><code>1
2
3
4
5
6
7
8
9
10
11
12
13</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>dialog.setButtons([
    {
        label: _(&quot;Cancel&quot;),
        action: this.callback.bind(this),
        key: Clutter.KEY_Escape
    },
    {
        label: _(&quot;OK&quot;),
        action: this.destroy.bind(this),
        key: Clutter.KEY_Return,
        default: true
    }
]);</code></pre></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect3">

<span id="id-1.2.14.2.7.3.9"></span>

#### Parameters

<div class="informaltable">

|         |                                            |     |
|---------|--------------------------------------------|-----|
| buttons | the buttons to display in the modal dialog |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-open"></span>

### open ()

``` programlisting

open (int   timestamp);
```

Opens and displays the modal dialog.

<div class="refsect3">

<span id="id-1.2.14.2.7.4.5"></span>

#### Parameters

<div class="informaltable">

|           |                                                                                                 |     |
|-----------|-------------------------------------------------------------------------------------------------|-----|
| timestamp | (optional) timestamp optionally used to associate the call with a specific user initiated event |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-close"></span>

### close ()

``` programlisting

close (int   timestamp);
```

Closes the modal dialog.

<div class="refsect3">

<span id="id-1.2.14.2.7.5.5"></span>

#### Parameters

<div class="informaltable">

|           |                                                                                                 |     |
|-----------|-------------------------------------------------------------------------------------------------|-----|
| timestamp | (optional) timestamp optionally used to associate the call with a specific user initiated event |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-popModal"></span>

### popModal ()

``` programlisting

popModal (int   timestamp);
```

Drop modal status without closing the dialog; this makes the dialog
insensitive as well, so it needs to be followed shortly by either a <a
href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-close"
class="link" title="close ()"><code class="code">close()</code></a> or a
<a
href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-pushModal"
class="link" title="pushModal ()"><code
class="code">pushModal()</code></a>

<div class="refsect3">

<span id="id-1.2.14.2.7.6.5"></span>

#### Parameters

<div class="informaltable">

|           |                                                                                                 |     |
|-----------|-------------------------------------------------------------------------------------------------|-----|
| timestamp | (optional) timestamp optionally used to associate the call with a specific user initiated event |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-pushModal"></span>

### pushModal ()

``` programlisting

pushModal (int   timestamp);
```

Pushes the modal to the modal stack so that it grabs the required
inputs.

<div class="refsect3">

<span id="id-1.2.14.2.7.7.5"></span>

#### Parameters

<div class="informaltable">

|           |                                                                                                 |     |
|-----------|-------------------------------------------------------------------------------------------------|-----|
| timestamp | (optional) timestamp optionally used to associate the call with a specific user initiated event |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog-_fadeOutDialog"></span>

### \_fadeOutDialog ()

``` programlisting

_fadeOutDialog (int   timestamp);
```

This method is like <a
href="cinnamon-js-ui-modalDialog-ModalDialog.html#cinnamon-js-ui-modalDialog-ModalDialog-close"
class="link" title="close ()"><code class="code">close()</code></a>, but
fades the dialog out much slower, and leaves the lightbox in place. Once
in the faded out state, the dialog can be brought back by an open call,
or the lightbox can be dismissed by a close call.

The main point of this method is to give some indication to the user
that the dialog response has been acknowledged but will take a few
moments before being processed.

e.g., if a user clicked "Log Out" then the dialog should go away
immediately, but the lightbox should remain until the logout is
complete.

<div class="refsect3">

<span id="id-1.2.14.2.7.8.7"></span>

#### Parameters

<div class="informaltable">

|           |                                                                                                 |     |
|-----------|-------------------------------------------------------------------------------------------------|-----|
| timestamp | (optional) timestamp optionally used to associate the call with a specific user initiated event |     |

</div>

</div>

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-modalDialog-ModalDialog.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog--state"></span>

### The `“state”` property

``` programlisting
  “state”                    ModalDialog.State
```

The state of the modal dialog, which may be `ModalDialog.State.OPENED`,
`CLOSED`, `OPENING`, `CLOSING` or `FADED_OUT`.

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-modalDialog-ModalDialog--contentLayout"></span>

### The `“contentLayout”` property

``` programlisting
  “contentLayout”            St.BoxLayout
```

The box containing the contents of the modal dialog (excluding the
buttons)

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
