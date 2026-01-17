|                                                                                                                                                                    |                                                                        |                                                                      |                                                                         |                                                                          |
|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-messageTray-Notification.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-messageTray-Notification.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span><span id="nav_properties">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-messageTray-Notification.properties"  
 class="shortcut">Properties</a></span>                                                                                                                              | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                      width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-messageTray-section.html" accesskey="u"><img 
                                                                                                                                                                                                                                               src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>   | <a href="cinnamon-js-ui-messageTray-section.html" accesskey="p"><img    
                                                                                                                                                                                                                                                                                                                      src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-modalDialog-section.html" accesskey="n"><img     
                                                                                                                                                                                                                                                                                                                                                                                                src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-messageTray-Notification"></span>

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
<td data-valign="top"><h2 id="messagetray.notification"><span
class="refentrytitle"><span
id="cinnamon-js-ui-messageTray-Notification.top_of_page"></span>MessageTray.Notification</span></h2>
<p>MessageTray.Notification — A shell notification.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                          |
|-----------------------------------|----------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification-update"        
                                     class="link" title="update ()">update</a> <span class="c_punctuation">()</span>                           |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification-scrollTo"      
                                     class="link" title="scrollTo ()">scrollTo</a> <span class="c_punctuation">()</span>                       |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification-addButton"     
                                     class="link" title="addButton ()">addButton</a> <span class="c_punctuation">()</span>                     |
| <span class="returnvalue"></span> | <a                                                                                                       
                                     href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification-clearButtons"  
                                     class="link" title="clearButtons ()">clearButtons</a> <span class="c_punctuation">()</span>               |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.properties"></span>

## Properties

<div class="informaltable">

|                                  |                                                                                                     |     |
|----------------------------------|-----------------------------------------------------------------------------------------------------|-----|
| <span class="type">object</span> | <a                                                                                                  
                                    href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification--source"  
                                    class="link" title="The “source” property">source</a>                                                |     |
| <span class="type">string</span> | <a                                                                                                  
                                    href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification--title"   
                                    class="link" title="The “title” property">title</a>                                                  |     |
| <span class="type">string</span> | <a                                                                                                  
                                    href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification--body"    
                                    class="link" title="The “body” property">body</a>                                                    |     |
| <span class="type">object</span> | <a                                                                                                  
                                    href="cinnamon-js-ui-messageTray-Notification.html#cinnamon-js-ui-messageTray-Notification--params"  
                                    class="link" title="The “params” property">params</a>                                                |     |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── MessageTray.Notification
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.description"></span>

## Description

Creates a notification with the associated title and body

`params` can contain values for 'body', 'icon', 'titleMarkup',
'bodyMarkup', and 'silent' parameters.

By default, the icon shown is created by calling
source.createNotificationIcon(). However, if `params` contains an 'icon'
parameter, the passed in icon will be shown.

If `params` contains a 'titleMarkup', or 'bodyMarkup' parameter with the
value `true`, then the corresponding element is assumed to use pango
markup. If the parameter is not present for an element, then anything
that looks like markup in that element will appear literally in the
output.

If `params` contains a 'silent' parameter with the value `true`, then
the associated sound effects are suppressed. Note that notifications
with an URGENT priority will always play a sound effect if there is one
set.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification-update"></span>

### update ()

``` programlisting

update (string   title,
        string   body,
        object   params);
```

Updates the notification timestamp, title, and body and regenerates the
icon.

<div class="refsect3">

<span id="id-1.2.13.2.7.2.5"></span>

#### Parameters

<div class="informaltable">

|        |                                    |     |
|--------|------------------------------------|-----|
| title  | the new title                      |     |
| body   | the new body                       |     |
| params | as in the Notification constructor |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification-scrollTo"></span>

### scrollTo ()

``` programlisting

scrollTo (St.Side   side);
```

Scrolls the content area (if scrollable) to the indicated edge

<div class="refsect3">

<span id="id-1.2.13.2.7.3.5"></span>

#### Parameters

<div class="informaltable">

|      |                               |     |
|------|-------------------------------|-----|
| side | St.Side.TOP or St.Side.BOTTOM |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification-addButton"></span>

### addButton ()

``` programlisting

addButton (number   id,
           string   label);
```

Adds a button with the given `label` to the notification. All action
buttons will appear in a single row at the bottom of the notification.

If the button is clicked, the notification will emit the
`action`-invoked signal with `id` as a parameter.

<div class="refsect3">

<span id="id-1.2.13.2.7.4.6"></span>

#### Parameters

<div class="informaltable">

|       |                                   |     |
|-------|-----------------------------------|-----|
| id    | the action ID                     |     |
| label | the label for the action's button |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification-clearButtons"></span>

### clearButtons ()

``` programlisting

clearButtons ();
```

Removes all buttons.

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-messageTray-Notification.property-details"></span>

## Property Details

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification--source"></span>

### The `“source”` property

``` programlisting
  “source”                   object
```

The notification's Source

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification--title"></span>

### The `“title”` property

``` programlisting
  “title”                    string
```

The title/summary text

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification--body"></span>

### The `“body”` property

``` programlisting
  “body”                     string
```

Optional - body text

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-messageTray-Notification--params"></span>

### The `“params”` property

``` programlisting
  “params”                   object
```

Optional - additional params

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
