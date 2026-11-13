```
#     #      #   #       #              
##   ##      #                          
# # # #  ##  #   #   ##  #   ## # #  ## 
#  #  #   #  #   #  # #  #  # # # # #   
#     #  ##  #   #  #    #  # # # #  ## 
#     # # #  #   #  # #  #  # # # #   # 
#     #  ##  ##  ##  ##  ##  ##  ## ### 
____________________________________

###          #   #               #          
 #           #                              
 #   ##  ## ###  #   # #  ## ###  #   ##  ## 
 #  # # #    #   #  ## ## # # # #  #  # # #   
 #  ###  ##  #   #  # # # # # # #  #  ###  ## 
 #  #     #  #   #  #   # # # # #  #  #     # 
 #   ## ###  ##  ## #   ## ## # #  ##  ## ### 
____________________________________________
```

# Installation


To get started:

1. Get a HolyC Compiler like 👉 [Aiwnios](https://github.com/nrootconauto/Aiwnios)
2. Once the compiler is built, extract the MaliciousTestimonies directory.
3. Navigate to the new MaliciousTestimonies folder with `Cd("MaliciousTestimonies");`

4. Include the `Load.HC` file in your project. `#include "Load.HC"`.

**OR**

4. Simply load the file and press `F5` to run it.

That's it!


# WAD?

WAD (which, according to the Doom Bible, is an acronym for "Where's All the Data?") is the file format used by Doom and all Doom-engine-based games for storing data. A WAD file consists of a header, a directory, and the data lumps that make up the resources stored within the file. IWAD The acronym IWAD is generally interpreted as "internal WAD"[1] and refers to a WAD file which contains all of the external data for a complete game. 

included IWADS
Data/RPG.WAD

pointers to these wad file are selected in Frames.HC and I use Ids.HC aswell.

## Text

RPG engine uses a simple text file for storing actor and dialog data because json is too complex. Actor.TXT and Dialog.TXT are the main ones. OPTIONS.TXT has the player modified options data saved there.

### Sprites??
 TempleOS sprites are stored in the `Sprites` Folder

# Maps
Levels are stored as matrix with each grid containing NodeStuff like Actors, objects and Items.

# Animation
Some animations are procedural but most are handled by the Director CQue which cycles through current tasks as needed. AddDirective and HasDirective are useful for timing new actions.

# AI
Coming soon

# Multiplayer 
coming soon
