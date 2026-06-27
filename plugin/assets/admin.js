document.addEventListener('DOMContentLoaded', function() {
    // Copy to clipboard functionality
    const copyBtns = document.querySelectorAll('.woocs-copy-btn');
    
    copyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            
            if (targetInput) {
                targetInput.select();
                targetInput.setSelectionRange(0, 99999); /* For mobile devices */
                
                try {
                    document.execCommand('copy');
                    const originalText = this.innerText;
                    this.innerText = 'Copied!';
                    setTimeout(() => {
                        this.innerText = originalText;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                }
            }
        });
    });

    // Sync Now functionality
    const syncBtn = document.getElementById('woocs-sync-now-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', function() {
            const nonce = document.getElementById('woocs_sync_nonce').value;
            const ajaxUrl = document.getElementById('woocs_ajax_url').value;
            
            const originalText = this.innerText;
            this.innerText = 'Syncing...';
            this.disabled = true;

            const formData = new FormData();
            formData.append('action', 'woocs_sync_now');
            formData.append('nonce', nonce);

            fetch(ajaxUrl, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Sync initiated successfully! Check log for details.');
                    location.reload();
                } else {
                    alert('Sync failed: ' + (data.data.message || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error during sync:', error);
                alert('An error occurred during sync.');
            })
            .finally(() => {
                this.innerText = originalText;
                this.disabled = false;
            });
        });
    }
});
