__( 'Uploading...' ),
				sticky: true,
			} );
		}

		return args;
	}

	applyAfterCreate( data, args ) {
		if ( args.options?.progress ) {
			this.toast.hide();
		}

		return data;
	}

	async run() {
		this.file = this.args.file;

		if ( this.file.size > parseInt( window._wpPluploadSettings.defaults.filters.max_file_size, 10 ) ) {
			throw new Error( __( 'The file exceeds the maximum upload size for this site.', 'elementor' );