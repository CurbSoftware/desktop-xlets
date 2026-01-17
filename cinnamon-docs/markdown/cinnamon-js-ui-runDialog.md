|                                      |                                                                        |                                                                     |                                                                         |                                                                          |
|:-------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a> | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                        width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-runDialog-section.html" accesskey="u"><img  
                                                                                                                 src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-runDialog-section.html" accesskey="p"><img      
                                                                                                                                                                                       src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-search-section.html" accesskey="n"><img          
                                                                                                                                                                                                                                                                 src="right.png" data-border="0" width="16" height="16" alt="Next" /></a>  |

<div class="refentry">

<span id="cinnamon-js-ui-runDialog"></span>

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
<td data-valign="top"><h2 id="rundialog"><span
class="refentrytitle"><span
id="cinnamon-js-ui-runDialog.top_of_page"></span>RunDialog</span></h2>
<p>RunDialog</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-runDialog.functions"></span>

## Functions

<div class="informaltable">

|                                        |                                                                                                   |
|----------------------------------------|---------------------------------------------------------------------------------------------------|
| <span class="returnvalue">array</span> | <a                                                                                                
                                          href="cinnamon-js-ui-runDialog.html#cinnamon-js-ui-runDialog-completeCommand"                      
                                          class="link" title="completeCommand ()">completeCommand</a> <span class="c_punctuation">()</span>  |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-runDialog.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-runDialog-completeCommand"></span>

### completeCommand ()

``` programlisting
array
completeCommand (string   text);
```

This function finds possible command completions for `text`. `text` is
first split at whitespaces, and completion is performed on the last
segment. Note that this currently does not recognize escaped
whitespaces.

If the last segment starts with a `/`, then it is considered to be an
absolute path. Otherwise, if it is the first segment (ie. there is only
one segment), it will be treated as a path relative to the home
directory or a path relative to an element of `PATH`. Finally, if it is
not an absolute path and not a first segment, it will be treated as a
path relative to the home directory.

To perform the completion, first the directory of the last segment is
calculated. For example, if the last segment is `/foo/bar/hel`, then the
directory is `/foo/bar/`. Then everything in the directory is listed,
and it checks which items starts with `hel`. All the items will then be
listed in the `completions` array. The common part of all possible
completions is put in the `postfix` variable, and the tuple
`[postfix, completions]` is returned.

It is important to note that the returned variables are just the part
added by completion. So if `/foo/bar/hel` completes to `/foo/bar/hello`,
then `lo` is returned, instead of `/foo/bar/hello`. This is the case for
both the `postfix` and `completions` part.

A special case is when the last segment is empty. In this case, an empty
tuple is returned.

<div class="refsect3">

<span id="id-1.2.17.2.4.2.9"></span>

#### Parameters

<div class="informaltable">

|      |                             |     |
|------|-----------------------------|-----|
| text | initial string to complete. |     |

</div>

</div>

<div class="refsect3">

<span id="id-1.2.17.2.4.2.10"></span>

#### Returns

The tuple `[postfix, completions]`.

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
