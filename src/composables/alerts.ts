import Swal from 'sweetalert2'

export function useAlerts() {
  // --- Passive Notifications (Toasts) ---
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    },
  })

  const showSuccess = (message: string) => {
    Toast.fire({
      icon: 'success',
      title: message,
    })
  }

  const showError = (message: string) => {
    Toast.fire({
      icon: 'error',
      title: message,
    })
  }

  const showWarning = (message: string) => {
    Toast.fire({
      icon: 'warning',
      title: message,
    })
  }

  // --- Active Dialogs (Modals) ---
  const confirmAction = async (
    message: string,
    title: string = 'Are you sure?',
  ): Promise<boolean> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes',
      cancelButtonText: 'Cancel',
    })
    return result.isConfirmed
  }

  const promptAction = async (
    message: string,
    title: string = 'Input Required',
  ): Promise<string | null> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      input: 'text',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
    })
    return result.isConfirmed ? result.value : null
  }

  const promptChoice = async (
    message: string,
    options: Record<string, string>,
    title: string = 'Make a selection',
  ): Promise<string | null> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      input: 'select',
      inputOptions: options,
      inputPlaceholder: 'Select an option...',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
    })

    return result.isConfirmed ? result.value : null
  }

  // --- New Additions: Large Text & Export Data ---
  const promptTextArea = async (
    message: string,
    title: string = 'Input Required',
    placeholder: string = '',
  ): Promise<string | null> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      input: 'textarea',
      inputPlaceholder: placeholder,
      showCancelButton: true,
      confirmButtonColor: '#23A559',
      cancelButtonColor: '#4E5058',
      background: '#313338',
      color: '#DBDEE1',
      customClass: { input: 'swal-custom-textarea' },
    })
    return result.isConfirmed ? result.value : null
  }

  const displayExportText = async (
    textData: string,
    title: string = 'Export Data',
    message: string = 'Copy this text.',
  ): Promise<boolean> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      input: 'textarea',
      inputValue: textData,
      showCancelButton: true,
      confirmButtonText: '📋 Copy to Clipboard',
      cancelButtonText: 'Close',
      confirmButtonColor: '#5865F2',
      cancelButtonColor: '#4E5058',
      background: '#313338',
      color: '#DBDEE1',
      customClass: { input: 'swal-custom-textarea' },
      didOpen: () => {
        const input = Swal.getInput() as unknown as HTMLTextAreaElement
        if (input) input.readOnly = true
      },
    })
    return result.isConfirmed
  }

  return {
    showSuccess,
    showError,
    showWarning,
    confirmAction,
    promptAction,
    promptChoice,
    promptTextArea,
    displayExportText,
  }
}
