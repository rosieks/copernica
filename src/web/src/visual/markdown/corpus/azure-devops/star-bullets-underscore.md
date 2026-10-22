Release process
===============

The release is cut on _Tuesday_ and shipped on __Thursday__. Anything that
is not merged by Monday noon waits for the next train.

Checklist
---------

* Freeze the branch
* Run the _full_ regression suite
  * including the slow tests
  * and the __load__ tests
* Tag the release

+ Notify support
+ Update the status page

1) Build the artefacts
2) Sign them
3) Publish

***

~~~bash
./scripts/release.sh --dry-run
~~~

Done.
