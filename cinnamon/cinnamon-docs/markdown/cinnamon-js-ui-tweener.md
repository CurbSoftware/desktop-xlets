|                                                                                                                                             |                                                                        |                                                                     |                                                                         |                                                               |
|:--------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------|
| <a href="#" class="shortcut">Top</a><span id="nav_description">  <span class="dim">\|</span>  <a href="#cinnamon-js-ui-tweener.description" 
 class="shortcut">Description</a></span>                                                                                                      | <a href="index.html" accesskey="h"><img src="home.png" data-border="0" 
                                                                                                                                               width="16" height="16" alt="Home" /></a>                                | <a href="cinnamon-js-ui-tweener-section.html" accesskey="u"><img    
                                                                                                                                                                                                                        src="up.png" data-border="0" width="16" height="16" alt="Up" /></a>  | <a href="cinnamon-js-ui-tweener-section.html" accesskey="p"><img        
                                                                                                                                                                                                                                                                                              src="left.png" data-border="0" width="16" height="16" alt="Prev" /></a>  | <a href="cinnamon-js-ui-tweener-ClutterFrameTicker.html"      
                                                                                                                                                                                                                                                                                                                                                                        accesskey="n"><img src="right.png" data-border="0" width="16"  
                                                                                                                                                                                                                                                                                                                                                                        height="16" alt="Next" /></a>                                  |

<div class="refentry">

<span id="cinnamon-js-ui-tweener"></span>

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
<td data-valign="top"><h2 id="tweener"><span class="refentrytitle"><span
id="cinnamon-js-ui-tweener.top_of_page"></span>Tweener</span></h2>
<p>Tweener — File providing tweening functions</p></td>
<td class="gallery_image" style="text-align: right;"
data-valign="top"></td>
</tr>
</tbody>
</table>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tweener.functions"></span>

## Functions

<div class="informaltable">

|                                   |                                                                                               |
|-----------------------------------|-----------------------------------------------------------------------------------------------|
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-init"                             
                                     class="link" title="init ()">init</a> <span class="c_punctuation">()</span>                    |
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-addTween"                         
                                     class="link" title="addTween ()">addTween</a> <span class="c_punctuation">()</span>            |
| <span class="returnvalue"></span> | <a                                                                                            
                                     href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-getTweenCount"                        
                                     class="link" title="getTweenCount ()">getTweenCount</a> <span class="c_punctuation">()</span>  |
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-isTweening"                       
                                     class="link" title="isTweening ()">isTweening</a> <span class="c_punctuation">()</span>        |
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-removeTween"                      
                                     class="link" title="removeTween ()">removeTween</a> <span class="c_punctuation">()</span>      |
| <span class="returnvalue"></span> | <a href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-pauseTweens"                      
                                     class="link" title="pauseTweens ()">pauseTweens</a> <span class="c_punctuation">()</span>      |
| <span class="returnvalue"></span> | <a                                                                                            
                                     href="cinnamon-js-ui-tweener.html#cinnamon-js-ui-tweener-resumeTweens"                         
                                     class="link" title="resumeTweens ()">resumeTweens</a> <span class="c_punctuation">()</span>    |

</div>

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tweener.description"></span>

## Description

This is a wrapper around imports.tweener.tweener that adds a bit of
Clutter integration. If the tweening target is a Clutter.Actor, then the
tweenings will automatically be removed if the actor is destroyed.

ActionScript Tweener methods that imports.tweener.tweener doesn't
currently implement: getTweens, getVersion, registerTransition,
setTimeScale, updateTime.

imports.tweener.tweener methods that we don't re-export: pauseAllTweens,
removeAllTweens, resumeAllTweens. (It would be hard to clean up properly
after removeAllTweens, and also, any code that calls any of these is
almost certainly wrong anyway, because they affect the entire
application.)

</div>

<div class="refsect1">

<span id="cinnamon-js-ui-tweener.functions_details"></span>

## Functions

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-init"></span>

### init ()

``` programlisting

init ();
```

Function called by main.js when Cinnamon starts

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-addTween"></span>

### addTween ()

``` programlisting

addTween (Object   target,
          param    tweeningParameters);
```

This makes `target` tween according to the parameters of
`tweeningParameters`.

`tweeningParameters` contains certain tweening parameters that describe
the tween, and the actual things to tween. Everything that is not a
tweening parameter is processed as follows: If you have

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
5</code></pre></td>
<td class="listing_code"><pre class="programlisting"><code>{
    ...
    x: 7
    ...
}</code></pre></td>
</tr>
</tbody>
</table>

</div>

In your parameters, then the property `x` of the `target` object will be
animated to the value of `7`.

The tweening parameters are (shamelessly stolen from the actual Tweener
documentation):

<div class="itemizedlist">

- `time` (real): The duration of the transition in seconds

- `delay` (real): The delay (in seconds) before the transition starts.
  The default of this parameter (when omitted) is 0.

- `skipUpdates` (int): How many updates must be skipped before an actual
  update is made. This is a powerful property that allows the developer
  to enforce a different update rate for a given tweening, as if
  simulating a lower frame rate. This is useful on transitions that
  demand a share of the CPU that's higher than average on each new
  update, such as filter tweenings. A value of 1, for example, means
  that the tweening engine will do half of the updates on this
  transition, since it will update then skip one update; a value of 2
  means it will do one third of the normal updates, since it will
  update, then skip two updates. The default value for this parameter
  (when omitted) is 0, meaning no update is skipped at all, and the
  active tweenings are updated on every frame render.

- `transition` (string/function): The type of transition to use.
  Different equations can be used, producing different tweening updates
  based on time spent. You can specify this parameter by their internal
  string names (which you can find by seeing what's offered in the
  cinnamon-settings effects page), or use any custom function to have a
  customized easing (see below for examples and a more in-depth
  description). The default transition is "easeOutExpo".

  If you want to use a custom function as the transition, the function
  must receive four parameters: current time on the transition, starting
  tweening value, change needed in that value, and total easing duration
  (plus an optional object, which will contain any parameter passed as
  the transitionParams property of new tweenings). During each tweening,
  the transition function will be continuously called, with the first
  parameter increasing until it reaches the total duration; it must
  return the new expected value.

  An example of a custom transition is as follows:

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
  6</code></pre></td>
  <td class="listing_code"><pre class="programlisting"><code>let myFunc = function(t, b, c, d) {
      let ts = (t/=d)*t;
      let tc = ts*t;
      return b+c*(-97.1975*tc*ts + 257.5975*ts*ts + -234.4*tc + 80*ts + -5*t);
  };
  Tweener.addTween(this.actor, {x: 200, time: 1, transition: myFunc});</code></pre></td>
  </tr>
  </tbody>
  </table>

  </div>

- `transitionParams` (array): extra parameters to pass to the custom
  transition function

- `onStart` (function): A function that is called immediately before a
  tweening starts. It is called once regardless of the number of
  properties involved on the tweening. The function scope (in which the
  event is executed) is the target object itself, unless specified by
  the onStartScope parameter.

- `onUpdate` (function): A function that is called every time a tweening
  updates its properties. The function scope (in which the event is
  executed) is the target object itself, unless specified by the
  `onUpdateScope` parameter.

- `onComplete` (function): A function that is called immediately after a
  tweening is completed. It is called once regardless of the number of
  properties involved on the tweening. The function scope (in which the
  event is executed) is the target object itself, unless specified by
  the `onCompleteScope` parameter.

- `onOverwrite` (function): A function that is called when tweening is
  overwritten. It is called once regardless of the number of properties
  involved on the tweening. The function scope is the target object
  itself, unless specified by the `onOverwriteScope` parameter.

- `onError` (function): A function that gets called when an error occurs
  when trying to run a tweening. This is used to handle errors more
  commonly thrown by other events (that is, from code not controlled by
  Tweener), such as onStart, onUpdate or onComplete. The function scope
  (in which the event is executed) is the target object itself, unless
  specified by the `onErrorScope` parameter.

- `rounded` (boolean): Whether or not the values for this tweening must
  be rounded before being applied to their respective properties. This
  is useful, for example, when sliding objects that must be positioned
  on round pixels, like labels that use pixel fonts; its x and y
  properties need to be rounded all the time to avoid blurring the text.
  This option acts on all properties for that specific tween. The
  default value for this parameter (when omitted) is false.

- `min` (real): The minimum the values of this tweening can take. This
  is useful, for example, when you animate the opacity of an object with
  a bounce transition and don't want the opacity of an object to fall
  below 0. Leave empty for no minimum.

- `max` (real): The maximum the values of this tweening can take. This
  is useful, for example, when you animate the opacity of an object with
  a bounce transition and don't want the opacity of an object to go
  above 1. Leave empty for no maximum.

- `onStartParams` (array): A list of parameters (of any type) to be
  passed to the onStart function.

- `onUpdateParams` (array): A list of parameters (of any type) to be
  passed to the onUpdate function.

- `onCompleteParams` (array): A list of parameters (of any type) to be
  passed to the onComplete function.

- `onOverwriteParams` (array): A list of parameters (of any type) to be
  passed to the onOverwrite function.

- `onStartScope` (object): The object in which the onStart function will
  be executed. This is needed if you have some specialized code inside
  the event function; in that case, references to this. inside the
  function will reference to the object defined by this parameter. If
  omitted, the tweened object is the scope used instead.

- `onUpdateScope` (object): The object in which the onUpdate function
  will be executed. This is needed if you have some specialized code
  inside the event function; in that case, references to this. inside
  the function will reference to the object defined by this parameter.
  If omitted, the tweened object is the scope used instead.

- `onCompleteScope` (object): The object in which the onComplete
  function will be executed. This is needed if you have some specialized
  code inside the event function; in that case, references to this.
  inside the function will reference to the object defined by this
  parameter. If omitted, the tweened object is the scope used instead.

- `onOverwriteScope` (object): The object in which the onOverwrite
  function will be executed. This is needed if you have some specialized
  code inside the event function; in that case, references to this.
  inside the function will reference to the object defined by this
  parameter. If omitted, the tweened object is the scope used instead.

- `onErrorScope` (object): The object in which the onError function will
  be executed. This is needed if you have some specialized code inside
  the event function; in that case, references to this. inside the
  function will reference to the object defined by this parameter. If
  omitted, the tweened object is the scope used instead.

</div>

<div class="refsect3">

<span id="id-1.2.22.2.5.3.10"></span>

#### Parameters

<div class="informaltable">

|                    |                     |     |
|--------------------|---------------------|-----|
| target             | the object to tween |     |
| tweeningParameters | parameters          |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-getTweenCount"></span>

### getTweenCount ()

``` programlisting

getTweenCount (Object   scope);
```

Returns the number of tweens `scope` currently has.

<div class="refsect3">

<span id="id-1.2.22.2.5.4.5"></span>

#### Parameters

<div class="informaltable">

|       |                                 |     |
|-------|---------------------------------|-----|
| scope | the object we are interested in |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-isTweening"></span>

### isTweening ()

``` programlisting

isTweening (Object   scope);
```

Returns whether `scope` is animating

<div class="refsect3">

<span id="id-1.2.22.2.5.5.5"></span>

#### Parameters

<div class="informaltable">

|       |                                 |     |
|-------|---------------------------------|-----|
| scope | the object we are interested in |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-removeTween"></span>

### removeTween ()

``` programlisting

removeTween (Object   scope);
```

Removes all tweens running on the object.

FIXME: removeTweens should be much more powerful, but I have no idea how
it works

<div class="refsect3">

<span id="id-1.2.22.2.5.6.6"></span>

#### Parameters

<div class="informaltable">

|       |                                 |     |
|-------|---------------------------------|-----|
| scope | the object we are interested in |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-pauseTweens"></span>

### pauseTweens ()

``` programlisting

pauseTweens (Object   scope);
```

Pauses all the tweens running on the object. Can be resumed with
Tweener.resumeTweens

FIXME: removeTweens should be much more powerful, but I have no idea how
it works

<div class="refsect3">

<span id="id-1.2.22.2.5.7.6"></span>

#### Parameters

<div class="informaltable">

|       |                                 |     |
|-------|---------------------------------|-----|
| scope | the object we are interested in |     |

</div>

</div>

</div>

------------------------------------------------------------------------

<div class="refsect2">

<span id="cinnamon-js-ui-tweener-resumeTweens"></span>

### resumeTweens ()

``` programlisting

resumeTweens (Object   scope);
```

Resumes all the tweens running on the object paused by
Tweener.pauseTweens

FIXME: removeTweens should be much more powerful, but I have no idea how
it works

<div class="refsect3">

<span id="id-1.2.22.2.5.8.6"></span>

#### Parameters

<div class="informaltable">

|       |                                 |     |
|-------|---------------------------------|-----|
| scope | the object we are interested in |     |

</div>

</div>

</div>

</div>

</div>

<div class="footer">

------------------------------------------------------------------------

Generated by GTK-Doc V1.34.0

</div>
