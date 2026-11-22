on run argv
	set f to item 1 of argv
	set out to ""
	tell application "Microsoft Excel"
		open (POSIX file f)
		delay 3
		set wb to active workbook
		calculate full
		set specs to {{"PrechargeDischarge", "D14"}, {"PrechargeDischarge", "F14"}, {"Accumulator", "O12"}, {"Accumulator", "Q12"}, {"Accumulator", "O24"}, {"Accumulator", "Q24"}, {"Shutdown Circuit", "D5"}, {"Shutdown Circuit", "F5"}, {"Shutdown Circuit", "K6"}, {"Shutdown Circuit", "M6"}, {"Other", "D6"}, {"Other", "F6"}, {"TS Schematics", "J30"}, {"TS Schematics", "K30"}}
		repeat with s in specs
			set sh to (item 1 of s) as text
			set rf to (item 2 of s) as text
			set v to string value of range rf of sheet sh of wb
			set out to out & (item 1 of s) & "!" & (item 2 of s) & " = " & (v as text) & linefeed
		end repeat
		close wb saving no
	end tell
	return out
end run
