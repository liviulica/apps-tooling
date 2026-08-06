require 'xcodeproj'
project = Xcodeproj::Project.open('ios/DailyBook.xcodeproj')
target = project.targets.find { |t| t.name == 'DailyBook' }
raise 'target not found' unless target

names = target.shell_script_build_phases.map(&:name)

unless names.include?('Copy GoogleService-Info.plist (if present)')
  phase = target.new_shell_script_build_phase('Copy GoogleService-Info.plist (if present)')
  phase.shell_script = <<~SH
    # Ship-dark crash reporting: the Firebase config file is copied into the
    # bundle only when it exists, so builds without it stay green and run
    # identically (AppDelegate only configures Firebase when the plist is in
    # the bundle). Drop the real file at ios/DailyBook/GoogleService-Info.plist
    # and rebuild; no Xcode UI needed.
    PLIST="${PROJECT_DIR}/DailyBook/GoogleService-Info.plist"
    if [ -f "$PLIST" ]; then
      cp "$PLIST" "${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/"
    fi
  SH
  # Always-run: its inputs are conditional on purpose.
  phase.always_out_of_date = '1'
end

unless names.include?('Upload dSYMs to Crashlytics (if configured)')
  phase = target.new_shell_script_build_phase('Upload dSYMs to Crashlytics (if configured)')
  phase.shell_script = <<~SH
    # Crashlytics needs the dSYMs or every report is unreadable addresses.
    # Guarded on the same plist as everything else: without Firebase config
    # there is nothing to upload to and the build must not fail.
    PLIST="${PROJECT_DIR}/DailyBook/GoogleService-Info.plist"
    RUN="${PODS_ROOT}/FirebaseCrashlytics/run"
    if [ -f "$PLIST" ] && [ -f "$RUN" ]; then
      "$RUN" -gsp "$PLIST" -p ios "${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"
    fi
  SH
  phase.input_paths = [
    '${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}',
    '$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist',
    '$(TARGET_BUILD_DIR)/$(EXECUTABLE_PATH)',
  ]
  phase.always_out_of_date = '1'
end

project.save
puts 'phases: ' + target.shell_script_build_phases.map(&:name).join(' | ')
