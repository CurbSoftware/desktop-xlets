|                                                                                                                                                                  |                                                                        |                                                                     |                                                                         |                                                                          |
|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-systray-SystrayManager.description"       
 class="shortcut">Description</a></span><span id="nav_hierarchy">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-systray-SystrayManager.object-hierarchy"  
 class="shortcut">Object Hierarchy</a></span>                                                                                                                      | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                                                    width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-systray-section.html" accesskey="u"><img    
                                                                                                                                                                                                                                             src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-systray-section.html" accesskey="p"><img        
                                                                                                                                                                                                                                                                                                                   src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-tooltips-section.html" accesskey="n"><img        
                                                                                                                                                                                                                                                                                                                                                                                             src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-systray-SystrayManager"></span>

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
<td data-valign="top"><h2 id="systray.systraymanager"><span
class="refentrytitle"><span
id="cinnamon-js-ui-systray-SystrayManager.top_of_page"></span>Systray.SystrayManager</span></h2>
<p>Systray.SystrayManager — Utility class for registering tray icon
replacements</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-systray-SystrayManager.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                                                       |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-systray-SystrayManager.html#cinnamon-js-ui-systray-SystrayManager-registerTrayIconReplacement"    
                                     class="link"                                                                                                           
                                     title="registerTrayIconReplacement ()">registerTrayIconReplacement</a> <span class="c_punctuation">()</span>           |
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-systray-SystrayManager.html#cinnamon-js-ui-systray-SystrayManager-unregisterTrayIconReplacement"  
                                     class="link"                                                                                                           
                                     title="unregisterTrayIconReplacement ()">unregisterTrayIconReplacement</a> <span class="c_punctuation">()</span>       |
| <span class="returnvalue"></span> | <a                                                                                                                    
                                     href="cinnamon-js-ui-systray-SystrayManager.html#cinnamon-js-ui-systray-SystrayManager-getRoles"                       
                                     class="link" title="getRoles ()">getRoles</a> <span class="c_punctuation">()</span>                                    |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-systray-SystrayManager.object-hierarchy"></span>

## Object Hierarchy

``` screen
    Object
    ╰── Systray.SystrayManager
  
```

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-systray-SystrayManager.description"></span>

## Description

This allows applets or other extensions to replace an app's legacy tray
icon. For instance, the default network applet registers itself to
replace network- manager's tray icon.

Tray icons typically show up in .xsession-errors as: ... Adding systray:
evolution-alarm-notify (48x48px) ... If you wrote an applet to replace
the alarm tray icon, you would register here with the name
'evolution-alarm-notify' and the uuid of your applet. As a result, if
your applet is loaded, the tray icon would be removed.

Accessible at runtime as Main.systrayManager.

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-systray-SystrayManager.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-systray-SystrayManager-registerTrayIconReplacement"></span>

### registerTrayIconReplacement ()

``` programlisting

registerTrayIconReplacement (string   role,
                             string   uuid);
```

Registers the uuid to replace a tray icon identified by the role

<div class="refsect3">

<span id="id-1.2.20.2.6.2.5"></span>

#### Parameters

<div class="informaltable">

|      |                                                |     |
|------|------------------------------------------------|-----|
| role | The systray icon name as reported in the logs. |     |
| uuid | The uuid of the applet, desklet, or extension. |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-systray-SystrayManager-unregisterTrayIconReplacement"></span>

### unregisterTrayIconReplacement ()

``` programlisting

unregisterTrayIconReplacement (string   uuid);
```

Unregisters the any roles claimed by uuid.

<div class="refsect3">

<span id="id-1.2.20.2.6.3.5"></span>

#### Parameters

<div class="informaltable">

|      |                                                |     |
|------|------------------------------------------------|-----|
| uuid | The uuid of the applet, desklet, or extension. |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-systray-SystrayManager-getRoles"></span>

### getRoles ()

``` programlisting

getRoles ();
```

Returns an array of registered roles.

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
