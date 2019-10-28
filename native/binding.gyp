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
	    "cppsrc/main.cc",
	    "cppsrc/owm.cc"
	],
	'include_dirs': [
	    "<!@(node -p \"require('node-addon-api').include\")"
	],
	'libraries': [],
	'dependencies': [
	    "<!(node -p \"require('node-addon-api').gyp\")"
	],
	'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ]
    }]
}
