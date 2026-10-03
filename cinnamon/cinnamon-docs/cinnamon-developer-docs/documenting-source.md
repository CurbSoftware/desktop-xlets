Home / Reference / Cinnamon Tutorials / Documentation

Writing documentation in source
The C part of Cinnamon can be documented using standard gtk-doc format, and there should be plenty of tutorials on that. The JavaScript part of Cinnamon can also be documented using something that resembles gtk-doc format.

Currently, we support documenting files (eg. main.js), objects (eg. Applet.Applet), functions (including functions of files and functions of objects), signals and enums.

The documentation appears as a comment right before the thing it describes. In the case of a file, it should appear at the very beginning of the file. If a object is declared using prototype, then it can appear right before either the function declaration or the prototype declaration, ie. before line 1 or line 5 in the example below. The documentation of signal can be placed anywhere within the prototype scope since there is no proper declaration of signals in javascript.

function Applet() {
    this._init()
}

Applet.prototype = {
    _init: function() {
        // Applet init code here
    }
}
The general format of a piece of code documentation is as follows:

/**
* name_of_thing:
* @short_description: one-line description
* @prop1 (type): description
* @prop2 (type): description
* @prop3 (type): description
*
* Long description
*
* Second paragraph of long description
*/
A comment block should always start with

/**
Avoid starting comments with this (use /* instead) even though the parser should be smart enough to not parse them, but if they look too like a piece of documentation, the parser might get confused.

The next line is the name of the thing being documented. Function, object, signal, file and enum documentations are distinguished using this line. They should look, respectively, like this:

/**
  * function_name:
  * #ObjectName:
  * FILE:filename.js
  * ENUM:EnumName
  * SIGNAL:signal-name
  */
Note that we do not have to include the namespace of an object, ie. it is #ObjectName, not #FileName.ObjectName.

Afterwards is a short description. This is only needed for files and objects, and will be ignored for functions. It is optional, but things look ugly without it. Note that it has to be short, hence the name. It is shown in the contents page in the form

Object.Name - short description
Afterwards, all the properties of the thing should be listed. A “property” is a globally accessible variable in the case of a file, a genuine property in the case of an object, a parameter for a function, an argument passed in the case of a signal, or an element of the enum for an enum. The type of the property is optional, but leaving it out makes the documentation less helpful and also more ugly (except for enums, where types should not appear). If the description is too long to fit in one line, break it into two rows using a single line break. Single line breaks are always ignored when parsing. For example,

/**
 * @prop (type): this is a very long description. Oh my gosh I am
 * running out of space!
 */
After the properties, a description of the thing should be given. Use two line breaks to signify the end of the properties section, and write as normal. It is okay to separate two properties with two line breaks. For example,

/**
  * @prop1 (type): hello
  *
  * @prop2 (type): world
  */
is fine, but two line breaks within a property description is not. eg

/**
  * @prop1 (type): line 1
  *
  * line 2
  * @prop2 (type): hello world
  */
is bad (line 2 will be treated as a description of the object itself). Instead, if you want the property description to have multiple paragraphs, put a \ character in place of the empty line, ie.

/**
  * @prop1 (type): line 1
  * \
  * line 2
  * @prop2 (type): hello world
  */
In the description section, two line breaks will be translated into an actual line break, and single line breaks are ignored.

At the end, in the case of a function, a return value can be specified in the form

/**
  * Returns (type): description of what is returned
  */
Despite looking like a property, the description can in fact have multiple paragraphs. The following is valid

/**
  * Returns (type): hey this function returns a really cool thing!
  * Want to know what it is?
  *
  * It is a random number!
  */
Objects should indicate what they directly inherit in the description, using the form

/**
  * Inherits: Applet.Applet
  */
Note that the namespace is required.

Automatic substitutions
The current parser is able to perform several substitutions:

The type of a property specified will be automatically converted to a link to the documentation of that type, if available.
In the description of itmes, @word will be automatically converted to code format, ie. enclosed within <code> tags.
In the description of items, *text more text* will be shown in italics and **text more text** will be shown in bold. Note that using _underlines to highlight_ is not supported since the parser will confuse it with private variables.
Links to other objects can be done with a #Hash. If you are linking to an object within the same file, you may omit the namespace, eg. using #Applet in Applet.AppletContextMenu. However, if it is from a different file, the namespace must be included.
Links to functions, properties or enums of other objects with a %percentage sign. If you wish to link to functions of the same object, the following four are acceptable:
this.func
this.func()
func
func()
Of course, if it is a property, then you would never want to include the () brackets. To refer to functions of other objects, you have to type the full name of the object. The namespace can be omitted if the object is in the same file. For example, the following are acceptable (assuming you are inside popupMenu.js.

PopupMenu.PopupBaseMenuItem._init
PopupMenu.PopupBaseMenuItem._init()
PopupBaseMenuItem._init
PopupBaseMenuItem._init()
If there are functions, properties and enums that take the same name, the property will be linked to, unless the name ends with (), in which case it will always be a function. If a function and an enum have the same name, the whole thing will explode into pieces and don’t do that. It is a bad idea to have things with the same name anyway.

Code blocks can be enclosed in descriptions as follows:

    ```
    this.is = some + code
    ```
Unordered lists can be created as follows:

  - List item 1
  - List item 2
    \
    Continuing item 2 with `\`
    
  No longer an item
Lists cannot be nested, but code blocks can appear in lists
