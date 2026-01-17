|                                                                                                                                              |                                                                        |                                                                     |                                                                         |                                                               |
|:---------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-settings.description" 
 class="shortcut">Description</a></span>                                                                                                       | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-settings-section.html" accesskey="u"><img   
                                                                                                                                                                                                                         src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-settings-section.html" accesskey="p"><img       
                                                                                                                                                                                                                                                                                               src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-settings-XletSettingsBase.html"       
                                                                                                                                                                                                                                                                                                                                                                         accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                         height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-settings"></span>

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
<td data-valign="top"><h2 id="settings"><span
class="refentrytitle"><span
id="cinnamon-js-ui-settings.top_of_page"></span>Settings</span></h2>
<p>Settings — File providing settings objects for xlets.</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-settings.other"></span>

## Types and Values

<div class="informaltable">

|      |                                                                              |
|------|------------------------------------------------------------------------------|
| enum | <a                                                                           
        href="cinnamon-js-ui-settings.html#cinnamon-js-ui-settings-BindingDirection"  
        class="link" title="enum BindingDirection">BindingDirection</a>               |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-settings.description"></span>

## Description

This file provides the settings API for applets, desklets and
extensions.

</div>

<div class="refsect1">

<span id="CinnamonGlobal.other_details"></span>

## Types and Values

<div class="refsect2">

<span id="cinnamon-js-ui-settings-BindingDirection"></span>

### enum BindingDirection

The direction of binding settings

Deprecated since 3.2: Binding direction is no longer meaningful. Please
do not use in new code.

<div class="refsect3">

<span id="id-1.2.19.2.5.2.5"></span>

#### Members

<div class="informaltable">

|                                                    |                                                                                                                                                                                  |
|----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| <span id="IN:CAPS"></span>IN                       | Set the property at binding time, and automatically update the property and execute the callback when the setting file changes. This is probably the most common mode.           |
| <span id="OUT:CAPS"></span>OUT                     | Set the property at binding time, and automatically update the setting file when the property changes. The callback can be omitted when using this mode, as it will not be used. |
| <span id="BIDIRECTIONAL:CAPS"></span>BIDIRECTIONAL | Combines the effects of `IN` and `OUT`.                                                                                                                                          |

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
