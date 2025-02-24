function events
    # Check if an argument was provided
    if test (count $argv) -eq 0
        echo "Usage: events [command]"
        echo "Available commands: scenarios, cat"
        return 1
    end

    switch $argv[1]
        case "scenarios"
            # copy the events from the scenario to the event-stream
            set dir fake-events/$argv[2]
            if test -d $dir
                rm -rf event-stream
                mkdir -p event-stream
				# if dir has no files, exit
				if test (find $dir -type f | wc -l) -eq 0
					return 0
				end
                cp $dir/* event-stream/
            else
                echo "Scenario $argv[2] not found"
                return 1
            end
        case "cat"
            # Handle cat command
            echo "Showing events listed"
            # Add your categories logic here 

		case "watch"
			# watch the event-stream for changes
			set last_processed "-1"
			while true
				# Get all files, sort them numerically, and process only new ones
				for file in (ls event-stream 2>/dev/null | sort)
                    set file "event-stream/$file"
					set file_num (string sub -l 4 (basename $file))
					if test -n "$file_num" -a "$file_num" -gt "$last_processed"
						cat $file | jq -C --compact-output 'del(.timestamp)'
						set last_processed $file_num
					end
				end
				sleep 1
			end
        case '*'
            # Handle invalid commands
            echo "Unknown command: $argv[1]"
            echo "Available commands: scenarios, cat"
            return 1
    end
end

