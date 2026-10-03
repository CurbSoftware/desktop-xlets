|                                      |                                                                        |                                                                         |                                                                         |                                                               |
|:-------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a> | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                        width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-deskletManager-section.html" accesskey="u"><img 
                                                                                                                 src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>      | <a href="cinnamon-js-ui-deskletManager-section.html" accesskey="p"><img 
                                                                                                                                                                                           src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-deskletManager-DeskletContainer.html" 
                                                                                                                                                                                                                                                                     accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                     height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-deskletManager"></span>

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
<td data-valign="top"><h2 id="deskletmanager"><span
class="refentrytitle"><span
id="cinnamon-js-ui-deskletManager.top_of_page"></span>DeskletManager</span></h2>
<p>DeskletManager</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager.functions"></span>

## Functions

<div class="informaltable">

|                                             |                                                                                               |
|---------------------------------------------|-----------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span>           | <a                                                                                            
                                               href="cinnamon-js-ui-deskletManager.html#cinnamon-js-ui-deskletManager-init"                   
                                               class="link" title="init ()">init</a> <span class="c_punctuation">()</span>                    |
| <span class="returnvalue"></span>           | <a                                                                                            
                                               href="cinnamon-js-ui-deskletManager.html#cinnamon-js-ui-deskletManager-removeDesklet"          
                                               class="link" title="removeDesklet ()">removeDesklet</a> <span class="c_punctuation">()</span>  |
| <span class="returnvalue">dictionary</span> | <a                                                                                            
                                               href="cinnamon-js-ui-deskletManager.html#cinnamon-js-ui-deskletManager-getDefinitons"          
                                               class="link" title="getDefinitons ()">getDefinitons</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-deskletManager.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-deskletManager-init"></span>

### init ()

``` programlisting

init ();
```

Initialize desklet manager

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-deskletManager-removeDesklet"></span>

### removeDesklet ()

``` programlisting

removeDesklet (string   uuid,
               int      desklet_id);
```

Disable and remove the desklet `uuid`:`desklet_id`

<div class="refsect3">

<span id="id-1.2.6.2.4.3.5"></span>

#### Parameters

<div class="informaltable">

|            |                     |     |
|------------|---------------------|-----|
| uuid       | uuid of the desklet |     |
| desklet_id | id of the desklet   |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-deskletManager-getDefinitons"></span>

### getDefinitons ()

``` programlisting
dictionary
getDefinitons ();
```

Gets the list of enabled desklets. Returns an associative array of three
items: raw: the unprocessed array from gsettings definitions:
Array(Object)

<div class="refsect3">

<span id="id-1.2.6.2.4.4.5"></span>

#### Returns

Associative array of three items

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
