|                                      |                                                                        |                                                                     |                                                                         |                                                                          |
|:-------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a> | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                        width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-extension-section.html" accesskey="u"><img  
                                                                                                                 src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-extension-section.html" accesskey="p"><img      
                                                                                                                                                                                       src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-layout-section.html" accesskey="n"><img          
                                                                                                                                                                                                                                                                 src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-extension"></span>

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
<td data-valign="top"><h2 id="extension"><span
class="refentrytitle"><span
id="cinnamon-js-ui-extension.top_of_page"></span>Extension</span></h2>
<p>Extension</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-extension.functions"></span>

## Functions

<div class="informaltable">

|                                           |                                                                                                          |
|-------------------------------------------|----------------------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span>         | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-versionCheck"                                
                                             class="link" title="versionCheck ()">versionCheck</a> <span class="c_punctuation">()</span>               |
| <span class="returnvalue"></span>         | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-versionLeq"                                  
                                             class="link" title="versionLeq ()">versionLeq</a> <span class="c_punctuation">()</span>                   |
| <span class="returnvalue"></span>         | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-loadExtension"                               
                                             class="link" title="loadExtension ()">loadExtension</a> <span class="c_punctuation">()</span>             |
| <span class="returnvalue"></span>         | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-unloadExtension"                             
                                             class="link" title="unloadExtension ()">unloadExtension</a> <span class="c_punctuation">()</span>         |
| <span class="returnvalue"></span>         | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-reloadExtension"                             
                                             class="link" title="reloadExtension ()">reloadExtension</a> <span class="c_punctuation">()</span>         |
| <span class="returnvalue">Gio.File</span> | <a                                                                                                       
                                             href="cinnamon-js-ui-extension.html#cinnamon-js-ui-extension-findExtensionSubdirectory"                   
                                             class="link"                                                                                              
                                             title="findExtensionSubdirectory ()">findExtensionSubdirectory</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-extension.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-extension-versionCheck"></span>

### versionCheck ()

``` programlisting

versionCheck (required,
              current);
```

Check if a component is compatible for an extension. `required` is an
array, and at least one version must be lower than the current version.
`current` must be in the format \<major\>.\<minor\>.\<point\>.\<micro\>
\<micro\> is always ignored \<point\> is ignored if not specified (so
you can target the whole release) \<minor\> and \<major\> must match
Each target version must be at least \<major\> and \<minor\>

<div class="refsect3">

<span id="id-1.2.8.2.4.2.5"></span>

#### Parameters

<div class="informaltable">

|          |                                                     |     |
|----------|-----------------------------------------------------|-----|
| required | an array of minimum versions we are compatible with |     |
| current  | the version we have                                 |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-extension-versionLeq"></span>

### versionLeq ()

``` programlisting

versionLeq (string   a,
            string   b);
```

<div class="refsect3">

<span id="id-1.2.8.2.4.3.4"></span>

#### Parameters

<div class="informaltable">

|     |                    |     |
|-----|--------------------|-----|
| a   | the first version  |     |
| b   | the second version |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.8.2.4.3.5"></span>

#### Returns

whether a \<= b

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-extension-loadExtension"></span>

### loadExtension ()

``` programlisting

loadExtension (string           uuid,
               Extension.Type   type);
```

<div class="refsect3">

<span id="id-1.2.8.2.4.4.4"></span>

#### Parameters

<div class="informaltable">

|      |              |     |
|------|--------------|-----|
| uuid | uuid of xlet |     |
| type | type of xlet |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-extension-unloadExtension"></span>

### unloadExtension ()

``` programlisting

unloadExtension (string           uuid,
                 Extension.Type   type,
                 bool             deleteConfig);
```

<div class="refsect3">

<span id="id-1.2.8.2.4.5.4"></span>

#### Parameters

<div class="informaltable">

|              |                                            |     |
|--------------|--------------------------------------------|-----|
| uuid         | uuid of xlet                               |     |
| type         | type of xlet                               |     |
| deleteConfig | delete also config files, defaults to true |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-extension-reloadExtension"></span>

### reloadExtension ()

``` programlisting

reloadExtension (string           uuid,
                 Extension.Type   type);
```

Reloads an xlet. Useful when the source has changed.

<div class="refsect3">

<span id="id-1.2.8.2.4.6.5"></span>

#### Parameters

<div class="informaltable">

|      |              |     |
|------|--------------|-----|
| uuid | uuid of xlet |     |
| type | type of xlet |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-extension-findExtensionSubdirectory"></span>

### findExtensionSubdirectory ()

``` programlisting
Gio.File
findExtensionSubdirectory (Gio.File   dir);
```

For extensions that are shipped with multiple versions in different
directories, look for the largest available version that is less than or
equal to the current running version. If no such version is found, the
original directory is returned.

<div class="refsect3">

<span id="id-1.2.8.2.4.7.5"></span>

#### Parameters

<div class="informaltable">

|     |                        |     |
|-----|------------------------|-----|
| dir | directory to search in |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.8.2.4.7.6"></span>

#### Returns

directory object of the desired directory.

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
