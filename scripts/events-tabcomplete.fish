# Tab completion for the events command
complete -c events -f
complete -c events -n "__fish_use_subcommand" -a "scenarios" -d "List available scenarios"
complete -c events -n "__fish_use_subcommand" -a "cat" -d "Show event categories"
complete -c events -n "__fish_use_subcommand" -a "watch" -d "Watch the event-stream for changes"
# Complete directories under fake-events for the scenarios subcommand
complete -c events -n "__fish_seen_subcommand_from scenarios" -a "(ls -d fake-events/* 2>/dev/null | string replace 'fake-events/' '')" -d "Scenario"
# complete options for watch
complete -c events -n "__fish_seen_subcommand_from watch; and not __fish_contains_opt A; and not string match -q '*--all*' (commandline -p)" -a "-A" -d "Show all event data"
complete -c events -n "__fish_seen_subcommand_from watch; and not __fish_contains_opt A; and not string match -q '*--all*' (commandline -p)" -a "--all" -d "Show all event data"
