import Swal from 'sweetalert2'

export function useAlerts() {
  // --- Base Dark Theme Mixin ---
  const DarkSwal = Swal.mixin({
    background: '#2b2d31',
    color: '#dbdee1',
    confirmButtonColor: '#5865f2', // Discord Blurple
    cancelButtonColor: '#4e5058',
    customClass: {
      input: 'swal-dark-input',
    },
  })

  // --- Passive Notifications (Toasts) ---
  const Toast = DarkSwal.mixin({
    toast: true,
    position: 'bottom-end',
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
    const result = await DarkSwal.fire({
      title: title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#da373c',
      cancelButtonColor: '#4e5058',
    })
    return result.isConfirmed
  }

  const promptAction = async (
    message: string,
    title: string = 'Input Required',
  ): Promise<string | null> => {
    const result = await DarkSwal.fire({
      title: title,
      text: message,
      input: 'text',
      showCancelButton: true,
    })
    return result.isConfirmed ? result.value : null
  }

  const promptChoice = async (
    message: string,
    options: Record<string, string>,
    title: string = 'Make a selection',
  ): Promise<string | null> => {
    const result = await DarkSwal.fire({
      title: title,
      text: message,
      input: 'select',
      inputOptions: options,
      inputPlaceholder: 'Select an option...',
      showCancelButton: true,
    })
    return result.isConfirmed ? result.value : null
  }

  // --- Large Text & Export Data ---
  const promptTextArea = async (
    message: string,
    title: string = 'Input Required',
    placeholder: string = '',
  ): Promise<string | null> => {
    const result = await DarkSwal.fire({
      title: title,
      text: message,
      input: 'textarea',
      inputPlaceholder: placeholder,
      showCancelButton: true,
      confirmButtonColor: '#23A559',
      width: '70vw',
    })
    return result.isConfirmed ? result.value : null
  }

  const displayExportText = async (
    textData: string,
    title: string = 'Export Data',
    message: string = 'Copy this text.',
  ): Promise<boolean> => {
    const result = await DarkSwal.fire({
      title: title,
      text: message,
      input: 'textarea',
      inputValue: textData,
      showCancelButton: true,
      confirmButtonText: '📋 Copy to Clipboard',
      cancelButtonText: 'Close',
      width: '70vw',
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
