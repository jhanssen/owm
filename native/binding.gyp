{
    "targets": [{
	"target_name": "owm_native",
	"cflags!": [ "-fno-exceptions" ],
	"cflags_cc!": [ "-fno-exceptions" ],
	"cflags_cc": [ "-std=c++17" ],
	"conditions": [
	    ['OS=="mac"', {
		"xcode_settings": {
		    "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
		    "OTHER_CFLAGS": [ "-std=c++17"],
		}
	    }]
	],
	"sources": [
	    "libxcb-errors/src/extensions.c",
	    "libxcb-errors/src/xcb_errors.c",
	    "cppsrc/main.cc",
	    "cppsrc/owm.cc",
	    "cppsrc/graphics.cc"
	],
	'include_dirs': [
	    "libxcb-errors/include",
	    "<!@(node -p \"require('node-addon-api').include\")",
	    "<!@(pkg-config cairo --cflags-only-I | sed s/-I//g)",
	    "<!@(pkg-config libpng --cflags-only-I | sed s/-I//g)",
	    "<!@(pkg-config pangocairo --cflags-only-I | sed s/-I//g)",
	],
	'libraries': [
	    "-lxcb",
	    "-lxcb-ewmh",
	    "-lxcb-icccm",
	    "-lxcb-util",
	    "-lxcb-xkb",
	    "-lxcb-keysyms",
	    "-lxcb-randr",
	    "-lxkbcommon",
	    "-lxkbcommon-x11",
	    "<!@(pkg-config pixman-1 --libs)",
	    "<!@(pkg-config cairo --libs)",
	    "<!@(pkg-config libpng --libs)",
	    "<!@(pkg-config pangocairo --libs)",
	],
	'dependencies': [
	    "<!(node -p \"require('node-addon-api').gyp\")"
	]
    }]
}
