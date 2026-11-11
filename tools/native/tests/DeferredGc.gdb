set debuginfod enabled off
set breakpoint pending on
handle SIGUSR1 nostop noprint pass
handle SIGUSR2 nostop noprint pass
set $full_gc = 0
break JSC::FullGCActivityCallback::doCollection(JSC::VM&)
commands
silent
set $full_gc = $full_gc + 1
continue
end
run
printf "Deferred full-GC callbacks: %d\n", $full_gc
if $full_gc == 0
quit 1
end
if $_exitcode != 0
quit 1
end
quit 0
