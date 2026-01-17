Home / Reference / Cinnamon Tutorials / Extension System

Applet, desklet and extension settings
Introduction
This document is intended to serve as a guide and reference to the new Cinnamon applet, desklet, and extension settings API, new for Cinnamon 1.8. The goal of this API was to provide for an easy to implement and use storage system for settings.

We will start with a broad overview of the system, and then work our way into the details.

Overview
In a nutshell, your applet will provide a JSON file that defines various setting types and their details, including a key identifier, description, default value, minimum and maximums (in the case of numeric types) and other options pertinent to each type of setting.

When your applet is added to the panel, you instantiate a settings provider, which looks for this file, parses it, applies default values, and saves an “instance” copy to work with.

Once that setting provider is initialized, your applet can then bind properties to the various setting keys from that file, and use them to set up how your applet will look, feel, and operate. There are a few types of bindings available, depending on how you want your applet to control or be controlled by these settings.

That is the “live”, applet side of the picture.

The other side of this, is that same JSON file you created for your applet is also used by Cinnamon Settings (or System Settings as it will be known in 1.8,) to automatically generate a configuration panel to adjust all these settings. There are a number of formatting options, as well as the capability for some settings to be “dependent” on another setting - allowing you to deactivate or “grey out” settings that cannot be used in certain situations. Changes made to this panel are saved immediately, and can be handled by the applet via callbacks that you defined in your applet.

The settings-schema.json file
Here’s a basic example of a settings-schema.json file, that can define settings for your applet:

{
    "width": {
        "type" : "scale",
        "default" : 10,
        "min" : 2,
        "max" : 400,
        "step" : 1,
        "description" : "Amount of space in pixels"
    }
}
The most important item here to start is the key: "width". This is what your applet is going to specify when binding a property to the setting provider. Within the width node are the various details specific to that key, and differ depending on what type of setting you’ll be using.

In this case:

type: defines what type of widget you want to use to adjust this value. In general the names of these types will be similar to what GTK uses, but always lowercase, and single word.
default: defines what you want your default, or starting value to be for this setting. Since scale defines a numeric type, the default will be a numeral (no quotations). You can use floating point, but you must have a leading 0 for floating numbers less than 1 (i.e. 0.1).
min: the lower limit for your setting.
max: the upper limit for your setting.
step: the step amount for this setting - how much the value changes for each “click” or notch of the widget.
description: The description you want by your setting in the configuration panel, to explain what the setting controls.
The JSON file must be valid - it must pass any structure tests, not have extra commas, and so forth. There are a number of tools available online where you can paste the contents of your file in, and it will tell you if it is valid or not, and point out problem areas. One such site is http://jsonlint.com/.

So now we’ve got a settings-schema.json file. It goes in your applet directory, alongside the metadata.json, applet.js, and any other files you have.

Preparing your applet:
The first thing you need to do is add Settings to your “imports” at the top of your applet:

const Settings = imports.ui.settings;
You’ll also need to ensure that you’re passing along the instanceId of the applet from the main() function:

function main(metadata, orientation, panel_height, instanceId) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}
and

function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        //....
        //....
        //....
    }
Note: Desklets only need to pass metadata and instanceId through this chain, and extensions have no need of any of this.

Initializing the settings provider
Now, to actually initialize your settings provider, usually somewhere in the _init method of MyApplet, you’ll put something like this, which will use your applet’s own instance variables:

this.settings = new Settings.AppletSettings(this, "settings-example@cinnamon.org", instanceId);
If you prefer to have your preferences in a separate object, you can do like this, and the object will be populated with your settings variables:

this._preferences = {};
this.settings = new Settings.AppletSettings(this._preferences, "settings-example@cinnamon.org", instanceId);
In other words, the object reference you pass in can be any object. The UUID there can be just hardcoded, or can be drawn from the metadata (metadata["uuid"]), whichever you prefer. You can also leave off the instanceId if you haven’t defined your applet as multiple-instance capable.

Obviously, if instead of an applet, you have a desklet or an extension, you would use new Settings.DeskletSettings and new Settings.ExtensionSettings respectively.

Binding your settings
Since we only have one setting in our example, this will be very simple:

this.settings.bindProperty(Settings.BindingDirection.IN,
                           "width",
                           "width",
                           this.on_settings_changed,
                           null);
To explain:

.bindProperty: tells the settings provider you want to bind one of your settings keys to an applet property.
Settings.BindingDirection.IN: This tells the setting provider that you want your applet property to be updated by changes in the configuration file. Other flags exist to provide the opposite direction, as well as bidirectional updating. More on those later.
"width": This is the key value you defined in your settings-schema.json file that you want to match up with.
"width": This is the name of the property you want to store the value in your applet. You’ll refer to it traditionally as this.width from here on out in the applet code.
this.on_settings_changed: This is the method you want called when the setting value changes. NOTE: The property (this.width) already contains the new value when this method is called. All you have to do is act on it.
null: this is optional - it can be left off entirely, or used to pass any extra object to the callback if desired.
That’s basically it - your property, this.width, or this._preferences.width, is now managed by the setting provider, and will be automatically updated when the configuration changes, and your callback method automatically called so you can deal with the change.

Editing your configuration:
Once you’ve activated your applet, you can then go in to Cinnamon Settings, Applets, and the option to Configure will be displayed when you select it.

For our sample, we’d see:



This has been automatically generated by our JSON file. If we adjust the scale, the JSON config file is rewritten, the settings provider for our applet notices, and reloads the new value into the applet’s this.width property, and this.on_settings_changed() is called.

Alternatively, this can be launched by running the command cinnamon-settings applets *uuid* (with obvious modifications for desklets and extensions).

More information
The available settings items and widgets can be found an the Applet, desklet and extension settings reference, alongside with some extra options. The settings objects themselves are Settings.AppletSettings, Settings.DeskletSettings and Settings.ExtensionSettings, which all inherit Settings._provider. Most useful functions will be found inside the _provider object.